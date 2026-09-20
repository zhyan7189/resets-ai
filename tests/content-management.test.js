import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { onRequestDelete as discard, onRequestGet as listAdmin, onRequestPost as create, onRequestPut as update } from "../functions/api/admin/articles.js";
import { onRequestGet as authenticateAdmin } from "../functions/api/admin/auth.js";
import { onRequestGet as getAdminItem } from "../functions/api/admin/item.js";
import { onRequestGet as listPublic } from "../functions/api/articles/index.js";
import { onRequestGet as getItem } from "../functions/api/articles/item.js";
import { onRequestPost as click } from "../functions/api/articles/click.js";
import { onRequestGet as popular } from "../functions/api/articles/popular.js";
import { extractMetadata } from "../functions/api/admin/import.js";
import { extractArticleBody, extractXEmbed, onRequestPost as importLink } from "../functions/api/admin/import.js";
import { onRequestGet as overview } from "../functions/api/admin/overview.js";
import { onRequestPost as reviewContent } from "../functions/api/admin/review.js";
import { onRequestPost as trackVisit } from "../functions/api/analytics/visit.js";
import { onRequestPost as trackImpression } from "../functions/api/analytics/impression.js";
import { onRequestGet as versions } from "../functions/api/admin/versions.js";
import { onRequestPost as uploadImage } from "../functions/api/admin/upload.js";
import { onRequestGet as getMedia } from "../functions/api/media/[id].js";
import { onRequestGet as listAdminMedia } from "../functions/api/admin/media.js";
import { onRequestGet as listAds, onRequestPut as saveAd, onRequestPatch as toggleAd } from "../functions/api/admin/ads.js";
import { onRequestGet as publicAds } from "../functions/api/ads.js";
import { cleanArticle, cleanUrl, stripXProfileImages, videoPlayback } from "../lib/articles.js";

function environment() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return {
    ADMIN_TOKEN:"test-secret",
    DB:{ async batch(statements) {
      sqlite.exec("BEGIN");
      try { const output = []; for (const statement of statements) output.push(await statement.run()); sqlite.exec("COMMIT"); return output; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    }, prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            run:async () => ({ meta:statement.run(...values) }),
            first:async () => statement.get(...values) || null,
            all:async () => ({ results:statement.all(...values) }),
          };
        },
        first:async () => statement.get() || null,
        all:async () => ({ results:statement.all() }),
        run:async () => ({ meta:statement.run() }),
      };
    } },
  };
}

function request(path, method = "GET", data, authorized = false) {
  return new Request("https://example.com" + path, {
    method,
    headers:{ ...(authorized ? { authorization:"Bearer test-secret" } : {}), ...(data ? { "content-type":"application/json" } : {}) },
    ...(data ? { body:JSON.stringify(data) } : {}),
  });
}

const sample = {
  source_url:"https://example.org/story", source_name:"示例来源", author:"@writer",
  published_at:"2026-09-20", format:"article", category:"tutorial", rights:"summary",
  title:"一个可验证的项目案例", card_title:"项目案例", summary:"先确认需求，再验证是否有人愿意付费。",
};

test("后台登录验证不依赖数据库，错误密钥仍被拒绝", async () => {
  const env = { ADMIN_TOKEN:"test-secret" };
  assert.equal((await authenticateAdmin({ request:request("/api/admin/auth"), env })).status, 401);
  const accepted = await authenticateAdmin({ request:request("/api/admin/auth", "GET", undefined, true), env });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { authenticated:true });
});

test("媒体库按档案归组，包含没有素材的档案", async () => {
  const env = environment();
  await create({ request:request("/api/admin/articles", "POST", sample, true), env });
  await create({ request:request("/api/admin/articles", "POST", { ...sample, source_url:"https://example.org/with-cover", cover_url:"https://example.org/cover.png" }, true), env });
  const response = await listAdminMedia({ request:request("/api/admin/media", "GET", undefined, true), env });
  assert.equal(response.status, 200);
  const { archives, media } = await response.json();
  assert.equal(archives.length, 2);
  assert.deepEqual(archives.map((archive) => archive.items.length).sort(), [0, 1]);
  assert.equal(media.length, 1);
  assert.equal(media[0].type, "cover");
});

test("后台鉴权、草稿隔离、发布、下架和热度筛选", async () => {
  const env = environment();
  const denied = await listAdmin({ request:request("/api/admin/articles"), env });
  assert.equal(denied.status, 401);
  const saved = await create({ request:request("/api/admin/articles", "POST", sample, true), env });
  assert.equal(saved.status, 201);
  const { id } = await saved.json();
  assert.equal((await (await listPublic({ request:request("/api/articles"), env })).json()).articles.length, 0);
  assert.equal((await getItem({ request:request(`/api/articles/item?id=${id}`), env })).status, 404);
  const adminList = (await (await listAdmin({ request:request("/api/admin/articles", "GET", undefined, true), env })).json()).articles;
  assert.equal(adminList.length, 1);
  assert.equal("body" in adminList[0], false);
  assert.equal((await (await getAdminItem({ request:request(`/api/admin/item?id=${id}`, "GET", undefined, true), env })).json()).article.id, id);

  const published = await update({ request:request("/api/admin/articles", "PUT", { ...sample, id, status:"published" }, true), env });
  assert.equal(published.status, 200);
  assert.equal((await (await listPublic({ request:request("/api/articles"), env })).json()).articles[0].id, id);
  assert.equal((await getItem({ request:request(`/api/articles/item?id=${id}`), env })).status, 200);
  await click({ request:request("/api/articles/click", "POST", { article_id:id }), env });
  assert.equal((await (await popular({ env })).json()).article_id, id);

  const unpublished = await update({ request:request("/api/admin/articles", "PUT", { ...sample, id, status:"draft" }, true), env });
  assert.equal(unpublished.status, 200);
  assert.equal((await (await listPublic({ request:request("/api/articles"), env })).json()).articles.length, 0);
  assert.equal((await (await popular({ env })).json()).article_id, null);
  const history = (await (await versions({ request:request(`/api/admin/versions?id=${id}`, "GET", undefined, true), env })).json()).versions;
  assert.deepEqual(history.map((item) => item.revision), [3,2,1]);
  const metrics = await (await overview({ request:request("/api/admin/overview", "GET", undefined, true), env })).json();
  assert.equal(metrics.counts.draft, 1);
  assert.equal(metrics.total_reads, 1);
});

test("长卡从首篇已发布档案开始，随后按点击量更换；空库和下架内容不参与", async () => {
  const env = environment();
  assert.equal((await (await popular({ env })).json()).article_id, null);
  const first = await create({ request:request("/api/admin/articles", "POST", sample, true), env });
  const firstId = (await first.json()).id;
  assert.equal((await (await popular({ env })).json()).article_id, null);
  await update({ request:request("/api/admin/articles", "PUT", { ...sample, id:firstId, status:"published" }, true), env });
  const initial = await (await popular({ env })).json();
  assert.equal(initial.article_id, firstId);
  assert.equal(initial.clicks, 0);
  assert.equal(initial.article.card_title, sample.card_title);
  const secondSample = { ...sample, source_url:"https://example.org/second", title:"第二篇", card_title:"第二篇卡片" };
  const second = await create({ request:request("/api/admin/articles", "POST", secondSample, true), env });
  const secondId = (await second.json()).id;
  await update({ request:request("/api/admin/articles", "PUT", { ...secondSample, id:secondId, status:"published" }, true), env });
  await click({ request:request("/api/articles/click", "POST", { article_id:secondId }), env });
  assert.equal((await (await popular({ env })).json()).article_id, secondId);
  await update({ request:request("/api/admin/articles", "PUT", { ...secondSample, id:secondId, status:"archived" }, true), env });
  assert.equal((await (await popular({ env })).json()).article_id, firstId);
});

test("内容管理分页、审核拒绝与通过、可恢复删除", async () => {
  const env = environment();
  const first = await create({ request:request("/api/admin/articles", "POST", { ...sample, status:"review" }, true), env });
  const { id } = await first.json();
  const second = await create({ request:request("/api/admin/articles", "POST", { ...sample, source_url:"https://example.org/story-2", title:"另一个标题", status:"review" }, true), env });
  assert.equal(second.status, 201);
  const page = await listAdmin({ request:request("/api/admin/articles?page=1&page_size=10&status=review&q=另一个", "GET", undefined, true), env });
  const listed = await page.json();
  assert.equal(listed.total, 1);
  assert.equal(listed.articles[0].title, "另一个标题");
  const denied = await reviewContent({ request:request("/api/admin/review", "POST", { id, revision:1, action:"reject", note:"来源需核对" }, true), env });
  assert.equal(denied.status, 200);
  assert.equal((await denied.json()).status, "rejected");
  const resubmitted = await update({ request:request("/api/admin/articles", "PUT", { ...sample, id, revision:2, status:"review" }, true), env });
  assert.equal(resubmitted.status, 200);
  const approved = await reviewContent({ request:request("/api/admin/review", "POST", { id, revision:3, action:"approve" }, true), env });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).status, "published");
  const removed = await discard({ request:request("/api/admin/articles", "DELETE", { id, revision:4 }, true), env });
  assert.equal((await removed.json()).status, "discarded");
  assert.equal((await (await listPublic({ request:request("/api/articles"), env })).json()).articles.length, 0);
  const restored = await update({ request:request("/api/admin/articles", "PUT", { ...sample, id, revision:5, status:"review" }, true), env });
  assert.equal(restored.status, 200);
  const events = await env.DB.prepare("SELECT action,note FROM review_events WHERE article_id=? ORDER BY revision").bind(id).all();
  assert.deepEqual(events.results.map((item) => item.action), ["reject","approve"]);
});

test("驾驶舱统计从访问和卡片曝光启用后计数", async () => {
  const env = environment();
  const created = await create({ request:request("/api/admin/articles", "POST", { ...sample, status:"published" }, true), env });
  const { id } = await created.json();
  assert.equal((await trackVisit({ env })).status, 200);
  assert.equal((await trackImpression({ request:request("/api/analytics/impression", "POST", { article_ids:[id,id] }), env })).status, 200);
  await click({ request:request("/api/articles/click", "POST", { article_id:id }), env });
  const data = await (await overview({ request:request("/api/admin/overview", "GET", undefined, true), env })).json();
  assert.equal(data.analytics.ready, true);
  assert.equal(data.analytics.total_visits, 1);
  assert.equal(data.analytics.heat[0].clicks, 1);
  assert.equal(data.analytics.heat[0].impressions, 1);
});

test("发布前校验署名、授权正文与嵌入地址", () => {
  assert.equal(cleanArticle({ ...sample, author:"", status:"published" }).error, "publication_fields_required");
  assert.equal(cleanArticle({ ...sample, rights:"licensed", status:"published" }).error, "licensed_body_required");
  assert.equal(cleanArticle({ ...sample, rights:"licensed", body:"完整正文", status:"published" }).error, "rights_confirmation_required");
  assert.equal(cleanArticle({ ...sample, rights:"embed", format:"video", status:"published" }).error, "embed_video_required");
  assert.equal(cleanArticle({ ...sample, rights:"embed", format:"video", video_url:"https://example.org/watch", status:"published" }).error, "video_not_playable");
  assert.equal(cleanArticle({ ...sample, rights:"embed", format:"video", video_url:"https://youtu.be/abcdefghijk", status:"published" }).error, "rights_confirmation_required");
  assert.equal(cleanArticle({ ...sample, rights:"summary", body:"未经授权的全文" }).article.body, "");
  assert.equal(cleanUrl("http://example.com"), null);
  assert.equal(cleanUrl("https://127.0.0.1/private"), null);
  assert.equal(cleanArticle({ ...sample, cover_url:"/api/media/12345678-1234-1234-1234-123456789abc.png" }).article.cover_url, "/api/media/12345678-1234-1234-1234-123456789abc.png");
});

test("X、B 站、抖音官方播放器地址被识别，其他站点同形链接不被信任", () => {
  assert.equal(videoPlayback("https://x.com/Hss1128_/status/2101250885955555508").url, "https://platform.twitter.com/embed/Tweet.html?id=2101250885955555508");
  assert.equal(videoPlayback("https://www.bilibili.com/video/BV1B7411m7LV").url, "https://player.bilibili.com/player.html?bvid=BV1B7411m7LV");
  assert.equal(videoPlayback("https://www.bilibili.com/video/BV1B7411m7LV?p=2").url, "https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&p=2");
  assert.equal(videoPlayback("https://www.youtube.com/shorts/abcdefghijk").url, "https://www.youtube-nocookie.com/embed/abcdefghijk");
  assert.equal(videoPlayback("https://open.douyin.com/player/video?vid=7542437906955144448&autoplay=0").url, "https://open.douyin.com/player/video?vid=7542437906955144448&autoplay=0");
  assert.equal(videoPlayback("https://evil.example/status/2101250885955555508"), null);
});

test("X 官方嵌入文字可生成有来源的摘要，视频缩略图只用于判断内容形式", () => {
  const source = "https://x.com/Hss1128_/status/2101250885955555508";
  const embed = extractXEmbed({ url:source, author_name:"黄白", html:'<blockquote><p lang="zh">用这个skill⬇️，可以做出这样的影视后期特效 <a href="https://t.co/a">pic.twitter.com/a</a></p></blockquote>' }, source);
  assert.equal(embed.author, "@Hss1128_");
  assert.match(embed.summary, /影视后期特效/);
  assert.doesNotMatch(embed.summary, /pic\.twitter/);
  const metadata = extractMetadata('<meta property="og:image" content="https://pbs.twimg.com/amplify_video_thumb/123/img/x.jpg">', source);
  assert.equal(metadata.format, "video");
});

test("抖音完整链接调用官方接口，生成可审核的视频草稿", async () => {
  const env = environment();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes("get_iframe_by_video") ?
    Response.json({ err_no:0, data:{ iframe_code:'<iframe src="https://open.douyin.com/player/video?vid=7542437906955144448&amp;autoplay=0"></iframe>', video_title:"视频标题与内容介绍" } }) :
    new Response("不可读", { status:403 });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://www.douyin.com/video/7542437906955144448" }, true), env });
    assert.equal(response.status, 201);
    const { draft } = await response.json();
    assert.equal(draft.format, "video");
    assert.equal(draft.video_url, "https://open.douyin.com/player/video?vid=7542437906955144448&autoplay=0");
    assert.equal(draft.summary, "视频标题与内容介绍");
  } finally { globalThis.fetch = realFetch; }
});

test("抖音短链先解析为平台完整视频地址", async () => {
  const env = environment();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url) === "https://v.douyin.com/abc" ?
    new Response(null, { status:302, headers:{ location:"https://www.douyin.com/video/7542437906955144448" } }) :
    String(url).includes("get_iframe_by_video") ?
      Response.json({ err_no:0, data:{ iframe_code:'<iframe src="https://open.douyin.com/player/video?vid=7542437906955144448"></iframe>', video_title:"视频说明" } }) :
      new Response("受限", { status:403 });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://v.douyin.com/abc" }, true), env });
    assert.equal(response.status, 201);
    const { draft } = await response.json();
    assert.equal(draft.source_url, "https://www.douyin.com/video/7542437906955144448");
    assert.equal(draft.video_url, "https://open.douyin.com/player/video?vid=7542437906955144448&autoplay=0");
  } finally { globalThis.fetch = realFetch; }
});

test("X 视频链接从官方嵌入文字补齐摘要并保存可播放地址", async () => {
  const env = environment();
  const realFetch = globalThis.fetch;
  const source = "https://x.com/Hss1128_/status/2101250885955555508";
  globalThis.fetch = async (url) => String(url).includes("publish.twitter.com/oembed") ?
    Response.json({ url:source, author_name:"黄白", html:'<blockquote><p>用这个skill，可以做出这样的影视后期特效</p></blockquote>' }) :
    new Response('<meta property="og:image" content="https://pbs.twimg.com/amplify_video_thumb/123/img/x.jpg"><meta property="og:title" content="视频档案">', { headers:{ "content-type":"text/html" } });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:source }, true), env });
    assert.equal(response.status, 201);
    const { draft } = await response.json();
    assert.equal(draft.format, "video");
    assert.equal(draft.video_url, source);
    assert.match(draft.summary, /影视后期特效/);
  } finally { globalThis.fetch = realFetch; }
});

test("B 站短链只跟随本站重定向后生成官方播放器地址", async () => {
  const env = environment();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url) === "https://b23.tv/abc" ?
    new Response(null, { status:302, headers:{ location:"https://www.bilibili.com/video/BV1B7411m7LV" } }) :
    new Response('<meta property="og:title" content="B 站视频"><meta property="og:description" content="视频介绍"><meta name="author" content="作者">', { headers:{ "content-type":"text/html" } });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://b23.tv/abc" }, true), env });
    assert.equal(response.status, 201);
    const { draft } = await response.json();
    assert.equal(draft.source_url, "https://www.bilibili.com/video/BV1B7411m7LV");
    assert.equal(draft.video_url, draft.source_url);
  } finally { globalThis.fetch = realFetch; }
});

test("B 站页面受限时用公开稿件信息补标题、摘要和作者", async () => {
  const env = environment();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes("api.bilibili.com/x/web-interface/view") ?
    Response.json({ code:0, data:{ bvid:"BV1B7411m7LV", title:"示例视频标题", desc:"来自视频作者的简介", owner:{ name:"视频作者" }, pubdate:1584949882 } }) :
    new Response("受限", { status:412 });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://www.bilibili.com/video/BV1B7411m7LV" }, true), env });
    assert.equal(response.status, 201);
    const { draft } = await response.json();
    assert.equal(draft.title, "示例视频标题");
    assert.equal(draft.summary, "来自视频作者的简介");
    assert.equal(draft.author, "视频作者");
    assert.equal(draft.status, "review");
  } finally { globalThis.fetch = realFetch; }
});

test("图片上传须鉴权，并可经公开图片地址读取", async () => {
  const files = new Map();
  const env = { ADMIN_TOKEN:"test-secret", MEDIA:{
    async put(key, file) { files.set(key, file); },
    async get(key) {
      const file = files.get(key);
      return file ? { body:file.stream(), writeHttpMetadata(headers) { headers.set("content-type", "image/png"); } } : null;
    },
  } };
  const data = new FormData();
  data.set("image", new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0])], "cover.png", { type:"image/png" }));
  const denied = await uploadImage({ request:new Request("https://example.com/api/admin/upload", { method:"POST", body:data }), env });
  assert.equal(denied.status, 401);
  const saved = await uploadImage({ request:new Request("https://example.com/api/admin/upload", { method:"POST", body:data, headers:{ authorization:"Bearer test-secret" } }), env });
  assert.equal(saved.status, 201);
  const { url } = await saved.json();
  const media = await getMedia({ params:{ id:url.split("/").at(-1) }, env });
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/png");
});

test("链接导入只使用页面元数据，不编造正文", () => {
  const metadata = extractMetadata('<html><head><title>原始标题</title><meta property="og:title" content="公开标题"><meta property="og:description" content="公开摘要"><meta property="og:image" content="/cover.jpg"></head></html>', "https://example.org/post");
  assert.equal(metadata.title, "公开标题");
  assert.equal(metadata.summary, "公开摘要");
  assert.equal(metadata.cover_url, "https://example.org/cover.jpg");
  assert.equal(metadata.body, "");
});

test("来源提供 Article 结构化数据时提取署名和正文草稿", () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    "@type":"Article", headline:"实践记录", author:{ name:"作者甲" },
    datePublished:"2026-09-20", articleBody:"第一段完整内容。",
  }) + "</script>";
  const metadata = extractMetadata(html, "https://example.org/article");
  assert.equal(metadata.author, "作者甲");
  assert.equal(metadata.body, "第一段完整内容。");
  assert.equal(metadata.published_at, "2026-09-20");
});

test("通用文章提取保持段落和段内图片顺序", () => {
  const body = extractArticleBody('<nav>菜单</nav><article><h2>原始标题</h2><p>第一段<img src="/a.png" alt="图一">后半段</p><p>第二段。</p></article><aside>推荐</aside>', "https://example.org/post");
  assert.equal(body, "## 原始标题\n\n第一段\n\n![图一](https://example.org/a.png)\n\n后半段\n\n第二段。");
});

test("X 作者头像不会被当成正文配图，已发布旧记录也会过滤", async () => {
  const avatar = "https://pbs.twimg.com/profile_images/2092152764868816896/IcyU8-cQ_normal.jpg";
  const photo = "https://pbs.twimg.com/media/HSjbSu0acAAcPNp.jpg";
  const source = "https://x.com/Mileson07/status/2101167448448004249";
  const body = `![@Mileson07](${avatar})\n\n正文内容。\n\n![配图](${photo})`;
  const html = `<article><img src="${avatar}" alt="@Mileson07"><p>正文内容。</p><img src="${photo}" alt="配图"></article>`;
  assert.equal(extractArticleBody(html, source), `正文内容。\n\n![配图](${photo})`);
  assert.equal(stripXProfileImages(body, source), `正文内容。\n\n![配图](${photo})`);
  assert.equal(stripXProfileImages(body, "https://example.org/post"), body);
  assert.equal(cleanArticle({ ...sample, source_url:source, rights:"licensed", body }).article.body, `正文内容。\n\n![配图](${photo})`);
  const env = { DB:{ prepare() { return { all:async () => ({ results:[{ id:"old-x-article" }] }), bind() { return { first:async () => ({ ...sample, id:"old-x-article", source_url:source, body, cover_url:"", video_url:"", status:"published" }) }; } }; } } };
  const response = await getItem({ request:request("/api/articles/item?id=old-x-article"), env });
  const { article } = await response.json();
  assert.equal(article.body, `正文内容。\n\n![配图](${photo})`);
  assert.equal(JSON.parse(article.media_manifest).length, 1);
});

test("导入链接写入审核队列并保留原文和任务记录", async () => {
  const env = environment();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><head><meta property="og:title" content="原文标题"><meta name="author" content="@writer"><meta property="og:description" content="原文摘要"></head><article><p>第一段完整原文。</p></article></html>', { headers:{ "content-type":"text/html" } });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://example.org/post" }, true), env });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.draft.status, "review");
    assert.equal(result.draft.original_body, "第一段完整原文。");
    const loaded = await (await getAdminItem({ request:request(`/api/admin/item?id=${result.id}`, "GET", undefined, true), env })).json();
    assert.equal(loaded.article.body, "第一段完整原文。");
    const metrics = await (await overview({ request:request("/api/admin/overview", "GET", undefined, true), env })).json();
    assert.equal(metrics.jobs.length, 1);
  } finally { globalThis.fetch = realFetch; }
});

test("导入图片到 R2 后仍保留原始图片地址供审核", async () => {
  const env = environment();
  const images = new Map();
  env.MEDIA = { async put(key, data) { images.set(key, data); } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).endsWith(".png") ?
    new Response(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]), { headers:{ "content-type":"image/png" } }) :
    new Response('<meta property="og:title" content="带图教程"><meta property="og:description" content="教程摘要"><meta name="author" content="作者"><article><p>文字<img src="/a.png" alt="原图"></p></article>', { headers:{ "content-type":"text/html" } });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://example.org/post" }, true), env });
    assert.equal(response.status, 201);
    const { draft, media } = await response.json();
    assert.equal(images.size, 1);
    assert.deepEqual(media, { total:1, saved:1 });
    assert.match(draft.original_body, /https:\/\/example\.org\/a\.png/);
    assert.match(draft.body, /\/api\/media\/[a-f0-9-]{36}\.png/);
    assert.equal(draft.status, "review");
  } finally { globalThis.fetch = realFetch; }
});

test("只有封面图的视频链接也会自动保存图片到 R2", async () => {
  const env = environment();
  const images = new Map();
  env.MEDIA = { async put(key, data) { images.set(key, data); } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).endsWith("cover.png") ?
    new Response(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]), { headers:{ "content-type":"image/png" } }) :
    new Response('<meta property="og:title" content="视频原题"><meta property="og:description" content="视频简介"><meta name="author" content="原作者"><meta property="og:image" content="https://img.example.org/cover.png">', { headers:{ "content-type":"text/html" } });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://www.youtube.com/watch?v=abcdefghijk" }, true), env });
    assert.equal(response.status, 201);
    const { draft, media } = await response.json();
    assert.deepEqual(media, { total:1, saved:1 });
    assert.equal(images.size, 1);
    assert.match(draft.cover_url, /^\/api\/media\/[a-f0-9-]{36}\.png$/);
  } finally { globalThis.fetch = realFetch; }
});

test("受限的 X 链接只入需协助队列，不伪造正文", async () => {
  const env = environment();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("受限", { status:403 });
  try {
    const response = await importLink({ request:request("/api/admin/import", "POST", { url:"https://x.com/writer/status/123456" }, true), env });
    assert.equal(response.status, 201);
    const { draft, issues } = await response.json();
    assert.equal(draft.status, "needs_help");
    assert.equal(draft.body, "");
    assert.ok(issues.some((issue) => issue.includes("无法")));
  } finally { globalThis.fetch = realFetch; }
});

test("广告位须鉴权，启用后才公开，过期后自动隐藏", async () => {
  const env = environment();
  const ad = { slot:1, label:"推广", title:"示例品牌", description:"产品介绍", target_url:"https://example.org", active:true };
  assert.equal((await saveAd({ request:request("/api/admin/ads", "PUT", ad), env })).status, 401);
  assert.equal((await saveAd({ request:request("/api/admin/ads", "PUT", { ...ad, target_url:"http://example.org" }, true), env })).status, 400);
  assert.equal((await saveAd({ request:request("/api/admin/ads", "PUT", ad, true), env })).status, 200);
  assert.equal((await (await publicAds({ env })).json()).ads.length, 1);
  assert.equal((await (await listAds({ request:request("/api/admin/ads", "GET", undefined, true), env })).json()).ads[0].title, "示例品牌");
  const expired = { ...ad, ends_at:"2020-01-01T00:00" };
  assert.equal((await saveAd({ request:request("/api/admin/ads", "PUT", expired, true), env })).status, 200);
  assert.equal((await (await publicAds({ env })).json()).ads.length, 0);
});

test("四个广告位独立开关保留原广告内容，全部关闭后公开接口不返回广告位", async () => {
  const env = environment();
  const ad = { slot:1, title:"示例品牌", target_url:"https://example.org", active:true };
  assert.equal((await saveAd({ request:request("/api/admin/ads", "PUT", ad, true), env })).status, 200);
  assert.equal((await toggleAd({ request:request("/api/admin/ads", "PATCH", { slot:1, active:false }), env })).status, 401);
  assert.equal((await toggleAd({ request:request("/api/admin/ads", "PATCH", { slot:5, active:false }, true), env })).status, 400);
  for (let slot = 1; slot <= 4; slot++) {
    assert.equal((await toggleAd({ request:request("/api/admin/ads", "PATCH", { slot, active:false }, true), env })).status, 200);
  }
  const hidden = await (await publicAds({ env })).json();
  assert.deepEqual(hidden.hidden_slots, [1, 2, 3, 4]);
  assert.deepEqual(hidden.ads, []);
  const stored = await (await listAds({ request:request("/api/admin/ads", "GET", undefined, true), env })).json();
  assert.equal(stored.ads[0].title, "示例品牌");
  assert.equal(stored.ads[0].active, 0);
  assert.equal((await toggleAd({ request:request("/api/admin/ads", "PATCH", { slot:1, active:true }, true), env })).status, 200);
  const restored = await (await publicAds({ env })).json();
  assert.deepEqual(restored.hidden_slots, [2, 3, 4]);
  assert.equal(restored.ads[0].title, "示例品牌");
});

test("旧文章迁移后仍保留公开状态和首个历史版本", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE articles (
    id TEXT PRIMARY KEY,source_url TEXT,source_name TEXT,author TEXT,published_at TEXT,
    format TEXT,category TEXT,rights TEXT,status TEXT,title TEXT,card_title TEXT,
    summary TEXT,cover_url TEXT,body TEXT,video_url TEXT
  ); INSERT INTO articles VALUES ('old','https://example.org/old','来源','作者','2026-09-01',
    'article','tutorial','licensed','published','旧文章','旧卡片','摘要','','旧正文','');`);
  sqlite.exec(readFileSync(new URL("../db/migrations/001-content-console-v2.sql", import.meta.url), "utf8"));
  assert.equal(sqlite.prepare("SELECT status FROM articles WHERE id='old'").get().status, "published");
  const version = sqlite.prepare("SELECT snapshot FROM article_versions WHERE article_id='old'").get();
  assert.equal(JSON.parse(version.snapshot).body, "旧正文");
});
