import { authorized, cleanArticle, cleanMediaUrl, cleanUrl, database, json, mediaManifest, stripXProfileImages, videoPlayback } from "../../../lib/articles.js";

const decode = (value) => String(value || "")
  .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function sourceAdapter(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (["x.com", "twitter.com"].includes(host)) return "x";
  if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return "youtube";
  if (host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "b23.tv") return "bilibili";
  if (host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com")) return "douyin";
  return "web";
}

async function resolveShortLink(value) {
  let url = value;
  if (!["v.douyin.com", "b23.tv"].includes(new URL(url).hostname)) return url;
  for (let step = 0; step < 3; step++) {
    const response = await fetch(url, { redirect:"manual", signal:AbortSignal.timeout(8000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = cleanUrl(new URL(response.headers.get("location") || "", url).href);
    if (!next) break;
    const host = new URL(next).hostname.toLowerCase();
    if (!(host === "b23.tv" || host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com"))) break;
    url = next;
  }
  return url;
}

function stripTags(value) { return decode(String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }

// 通用文章页仅在明确的 article 标签内取段落，避免把导航和推荐位当成原文。
export function extractArticleBody(html, sourceUrl) {
  const article = String(html || "").match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (!article) return "";
  const safe = article.replace(/<(?:script|style|nav|aside)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|nav|aside)\s*>/gi, "");
  const blocks = [];
  const addImage = (attrs) => {
    const src = attrs.match(/(?:^|\s)(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    const alt = stripTags(attrs.match(/(?:^|\s)alt=["']([^"']*)["']/i)?.[1] || "").replace(/[\[\]]/g, "");
    let url = null;
    try { if (src) url = cleanMediaUrl(new URL(decode(src), sourceUrl).href); } catch { /* 跳过无效图片地址 */ }
    if (url) blocks.push(`![${alt}](${url})`);
  };
  const addVideo = (attrs, inner, index, length) => {
    const src = attrs.match(/(?:^|\s)(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
      inner.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
    let url = null;
    try { if (src) url = cleanUrl(new URL(decode(src), sourceUrl).href); } catch { /* 跳过无效视频地址 */ }
    if (!url || videoPlayback(url)?.type !== "video") return;
    const source = new URL(sourceUrl);
    const media = new URL(url);
    if (sourceAdapter(sourceUrl) === "x" && media.hostname !== "video.twimg.com") return;
    if (sourceAdapter(sourceUrl) !== "x" && media.hostname !== source.hostname) return;
    const following = safe.slice(index + length).split(/<\/figure>/i, 1)[0].match(/^[\s\S]{0,500}?<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
    const caption = stripTags(following?.[1] || "视频").replace(/[\[\]]/g, "").slice(0, 180);
    blocks.push(`@[${caption}](${url})`);
  };
  for (const match of safe.matchAll(/<(h[1-3]|p|blockquote|img|video)\b([^>]*)>([\s\S]*?)<\/\1>|<img\b([^>]*?)\/?\s*>/gi)) {
    const tag = (match[1] || "img").toLowerCase();
    if (tag === "img") { addImage(match[2] || match[4] || ""); continue; }
    if (tag === "video") { addVideo(match[2] || "", match[3] || "", match.index, match[0].length); continue; }
    const parts = String(match[3] || "").split(/(<img\b[^>]*\/?\s*>)/gi);
    for (const part of parts) {
      if (/^<img\b/i.test(part)) { addImage(part); continue; }
      const value = stripTags(part);
      if (value.length > 1) blocks.push(tag.startsWith("h") ? `${"#".repeat(Number(tag[1]))} ${value}` : tag === "blockquote" ? `> ${value}` : value);
    }
  }
  return stripXProfileImages(blocks.join("\n\n"), sourceUrl).slice(0, 120000);
}

export function mergeEmbeddedVideos(existing, extracted) {
  let result = String(existing || "");
  const source = String(extracted || "");
  for (const match of source.matchAll(/@\[[^\]\n]*\]\((https:\/\/[^\s)]+\.mp4(?:\?[^\s)]*)?)\)/gi)) {
    if (result.includes(match[1])) continue;
    const before = source.slice(0, match.index).split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).at(-1);
    const at = before ? result.indexOf(before) : -1;
    if (at >= 0) result = result.slice(0, at + before.length) + `\n\n${match[0]}` + result.slice(at + before.length);
    else result = [result.trim(), match[0]].filter(Boolean).join("\n\n");
  }
  return result;
}

export function extractMetadata(html, sourceUrl) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((match) => [match[1].toLowerCase(), decode(match[3])]));
    const key = attrs.property || attrs.name;
    if (key && attrs.content) meta[key.toLowerCase()] = attrs.content;
  }
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).replace(/<[^>]+>/g, "").trim();
  const origin = new URL(sourceUrl);
  const image = meta["og:image"] || meta["twitter:image"] || "";
  let structured = {};
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((item) => item?.["@graph"] || [item]);
      structured = candidates.find((item) => /(?:Article|BlogPosting|NewsArticle|VideoObject)/.test(String(item?.["@type"] || ""))) || structured;
      if (structured["@type"]) break;
    } catch { /* 格式错误的结构化数据不阻断手动录入。 */ }
  }
  const author = typeof structured.author === "string" ? structured.author :
    Array.isArray(structured.author) ? structured.author.map((item) => item?.name || "").filter(Boolean).join("、") :
    structured.author?.name || "";
  const body = extractArticleBody(html, sourceUrl) || (typeof structured.articleBody === "string" ? decode(structured.articleBody).slice(0, 120000) : "");
  const video = videoPlayback(sourceUrl) ? sourceUrl : "";
  return {
    source_url:sourceUrl,
    source_name:sourceAdapter(sourceUrl) === "x" ? "X" : meta["og:site_name"] || origin.hostname.replace(/^www\./, ""),
    author:meta.author || author || (sourceAdapter(sourceUrl) === "x" ? `@${origin.pathname.split("/").filter(Boolean)[0] || ""}` : ""),
    title:meta["og:title"] || meta["twitter:title"] || structured.headline || structured.name || title,
    summary:meta["og:description"] || meta["twitter:description"] || meta.description || structured.description || "",
    cover_url:image ? cleanUrl(new URL(image, sourceUrl).href) || "" : "",
    format:["youtube", "bilibili"].includes(sourceAdapter(sourceUrl)) || /video/i.test(meta["og:type"] || "") || /amplify_video_thumb|ext_tw_video_thumb/i.test(image) || sourceAdapter(sourceUrl) === "douyin" && /\/video\//.test(origin.pathname) ? "video" : "article",
    published_at:meta["article:published_time"] || structured.datePublished || "",
    body,
    video_url:video,
  };
}

export function extractXEmbed(data, sourceUrl) {
  const origin = new URL(sourceUrl);
  if (sourceAdapter(sourceUrl) !== "x" || !/^\/[A-Za-z0-9_]{1,15}\/status\/\d{1,20}\/?$/.test(origin.pathname)) return null;
  if (data?.url && new URL(data.url).pathname !== origin.pathname) return null;
  const paragraph = String(data?.html || "").match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
  const text = stripTags(paragraph).replace(/(?:https?:\/\/)?pic\.twitter\.com\/\w+\s*$/i, "").trim();
  const handle = origin.pathname.split("/")[1];
  return { author:`@${handle}`, title:data?.author_name ? `${data.author_name} (@${handle}) on X` : `@${handle} on X`, summary:text.slice(0, 180), body:text };
}

export function mergeXEmbedBody(body, embedText) {
  const existing = String(body || "").trim();
  const text = String(embedText || "").trim();
  if (!text) return existing;
  const written = existing.replace(/^!\[[^\]]*\]\([^\n]+\)\s*$/gm, "").trim();
  return written ? existing : [text, existing].filter(Boolean).join("\n\n");
}

export async function readLimited(response) {
  const reader = response.body?.getReader();
  if (!reader) return { html:"", truncated:false };
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 1048576) { truncated = true; await reader.cancel(); break; }
    chunks.push(value);
  }
  const output = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return { html:new TextDecoder().decode(output), truncated };
}

async function mirrorImage(url, env) {
  if (!url || url.startsWith("/api/media/")) return url;
  if (!env.MEDIA) return null;
  try {
    const response = await fetch(url, { redirect:"manual", signal:AbortSignal.timeout(5000) });
    const types = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" };
    const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!response.ok || !types[type] || Number(response.headers.get("content-length") || 0) > 8 * 1024 * 1024) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    if (size < 12) return null;
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    const signature = type === "image/png" ? data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 :
      type === "image/jpeg" ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff :
      type === "image/webp" ? String.fromCharCode(...data.slice(0,4)) === "RIFF" && String.fromCharCode(...data.slice(8,12)) === "WEBP" :
      ["GIF87a", "GIF89a"].includes(String.fromCharCode(...data.slice(0,6)));
    if (!signature) return null;
    const key = `${crypto.randomUUID()}.${types[type]}`;
    await env.MEDIA.put(key, data, { httpMetadata:{ contentType:type } });
    return `/api/media/${key}`;
  } catch { return null; }
}

async function mirrorArticleMedia(metadata, env) {
  const missing = [];
  const urls = [...new Set(mediaManifest(metadata.format === "article" ? metadata.body : "", metadata.cover_url, "")
    .filter((item) => item.type === "image" || item.type === "cover").map((item) => item.url))];
  const copied = new Map();
  if (urls.length > 24) missing.push(`图片数量超过单次导入上限（${urls.length} 张）；请核对并补齐。`);
  const queue = urls.slice(0, 24);
  let cursor = 0;
  await Promise.all(Array.from({ length:Math.min(8, queue.length) }, async () => {
    while (cursor < queue.length) {
      const url = queue[cursor++];
      const local = await mirrorImage(url, env);
      if (local) copied.set(url, local);
      else missing.push(`图片尚未入库：${url}`);
    }
  }));
  return {
    body:metadata.body.replace(/!\[([^\]\n]*)\]\(([^\s)]+)\)/g, (raw, alt, url) => copied.has(url) ? `![${alt}](${copied.get(url)})` : raw),
    cover_url:copied.get(metadata.cover_url) || metadata.cover_url,
    missing,
    total:urls.length,
    saved:copied.size,
  };
}

async function enrich(metadata, env) {
  if (!env.AI_API_KEY || !env.AI_API_URL || !env.AI_MODEL || !metadata.title) return null;
  try {
    const response = await fetch(env.AI_API_URL, {
      method:"POST",
      headers:{ "authorization":`Bearer ${env.AI_API_KEY}`, "content-type":"application/json" },
      body:JSON.stringify({ model:env.AI_MODEL, temperature:0.2, response_format:{ type:"json_object" }, messages:[
        { role:"system", content:"你是中文 AI 创业资讯编辑。只依据给定元数据生成中文卡片草稿。返回 JSON，包含 card_title、summary、category（opportunity/tutorial/tools/case/pitfall）。不要编造收入、成本、作者、发布日期、正文或事实。没有足够信息时保持保守。" },
        { role:"user", content:JSON.stringify({ title:metadata.title, description:metadata.summary, source:metadata.source_name }) },
      ] }),
      signal:AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const output = await response.json();
    const draft = JSON.parse(output.choices?.[0]?.message?.content || "{}");
    return {
      card_title:String(draft.card_title || "").slice(0, 180),
      summary:String(draft.summary || "").slice(0, 500),
      category:["opportunity", "tutorial", "tools", "case", "pitfall"].includes(draft.category) ? draft.category : "opportunity",
    };
  } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  let payload;
  try { payload = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const requestedFormat = payload?.format;
  if (requestedFormat != null && !["article","video"].includes(requestedFormat)) return json({ error:"invalid_format" }, 400);
  let url = cleanUrl(payload?.url);
  if (!url) return json({ error:"invalid_url" }, 400);
  try { url = await resolveShortLink(url); } catch { /* 短链接不可解析时保持原地址，转入人工补全。 */ }
  try {
    const existing = await env.DB.prepare("SELECT id FROM articles WHERE source_url = ?").bind(url).first();
    if (existing) return json({ error:"duplicate_url", id:existing.id }, 409);
  } catch { return json({ error:"database_unavailable" }, 503); }
  let metadata = { source_url:url, source_name:new URL(url).hostname, author:"", title:"", summary:"", cover_url:"", published_at:"", format:["youtube", "bilibili"].includes(sourceAdapter(url)) || sourceAdapter(url) === "douyin" && /\/video\//.test(new URL(url).pathname) || /\.mp4$/i.test(new URL(url).pathname) ? "video" : "article", body:"", video_url:videoPlayback(url) ? url : "" };
  let sourceBody = "";
  let extraction = "blocked";
  const issues = [];
  try {
    const response = await fetch(url, { redirect:"manual", headers:{ "accept":"text/html", "user-agent":"ResetsAI/1.0 (+content preview)" }, signal:AbortSignal.timeout(8000) });
    if (!response.ok || !/text\/html/i.test(response.headers.get("content-type") || "")) throw new Error("source_unavailable");
    const { html, truncated } = await readLimited(response);
    metadata = extractMetadata(html, url);
    sourceBody = metadata.body;
    if (truncated) issues.push("来源页面超过读取上限，原文可能不完整；请核对。 ");
    extraction = metadata.body ? "partial" : "metadata";
  } catch {
    issues.push("来源页面无法由服务器读取；请从已授权的原文或作者文件补全。 ");
  }
  if (sourceAdapter(url) === "x") {
    try {
      const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
      const response = await fetch(endpoint, { signal:AbortSignal.timeout(8000) });
      if (response.ok) {
        const embed = extractXEmbed(await response.json(), url);
        if (embed) {
          metadata.author = embed.author;
          metadata.title = embed.title;
          if (!metadata.summary) metadata.summary = embed.summary;
          if (embed.body) {
            sourceBody = mergeXEmbedBody(sourceBody, embed.body);
            metadata.body = sourceBody;
          }
          extraction = embed.body ? "partial" : extraction;
          if (metadata.format === "video") metadata.video_url = url;
          if (embed.body) {
            const blocked = issues.findIndex((issue) => issue.startsWith("来源页面无法由服务器读取"));
            if (blocked >= 0) issues.splice(blocked, 1);
          }
        }
      }
    } catch { /* X 嵌入接口不可用时保留人工补全流程。 */ }
  }
  if (sourceAdapter(url) === "douyin") {
    const videoId = new URL(url).pathname.match(/^\/(?:share\/)?video\/(\d{10,20})\/?$/)?.[1];
    if (videoId) {
      try {
        const response = await fetch(`https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id=${videoId}`, { signal:AbortSignal.timeout(8000) });
        const data = response.ok ? await response.json() : null;
        const iframe = String(data?.data?.iframe_code || "").match(/\bsrc=["']([^"']+)["']/i)?.[1];
        const player = iframe && videoPlayback(decode(iframe));
        if (data?.err_no === 0 && player?.url.startsWith("https://open.douyin.com/player/video?vid=")) {
          metadata.format = "video";
          metadata.video_url = player.url;
          if (data.data.video_title) metadata.title = String(data.data.video_title).trim().slice(0, 300);
          if (!metadata.summary) metadata.summary = String(data.data.video_title || "").trim().slice(0, 180);
          const blocked = issues.findIndex((issue) => issue.startsWith("来源页面无法由服务器读取"));
          if (blocked >= 0) issues.splice(blocked, 1);
        }
      } catch { /* 无法获取官方播放器时由审核人员补全。 */ }
    }
  }
  if (sourceAdapter(url) === "bilibili") {
    const bvid = new URL(url).pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})\/?$/i)?.[1];
    if (bvid) {
      try {
        const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { signal:AbortSignal.timeout(8000) });
        const data = response.ok ? await response.json() : null;
        if (data?.code === 0 && data.data?.bvid?.toLowerCase() === bvid.toLowerCase()) {
          metadata.format = "video";
          metadata.video_url = url;
          if (data.data.title) metadata.title = String(data.data.title).slice(0, 300);
          if (!metadata.summary) metadata.summary = String(data.data.desc || "").replace(/\s+/g, " ").trim().slice(0, 180);
          if (!metadata.author) metadata.author = String(data.data.owner?.name || "").slice(0, 120);
          if (!metadata.cover_url && /^https?:\/\//.test(data.data.pic || "")) metadata.cover_url = cleanUrl(String(data.data.pic).replace(/^http:/, "https:")) || "";
          if (!metadata.published_at && Number.isFinite(data.data.pubdate)) metadata.published_at = new Date(data.data.pubdate * 1000).toISOString().slice(0, 10);
          if (metadata.title || metadata.summary) {
            const blocked = issues.findIndex((issue) => issue.startsWith("来源页面无法由服务器读取"));
            if (blocked >= 0) issues.splice(blocked, 1);
          }
        }
      } catch { /* 页面和公开接口都不可用时保留人工补全流程。 */ }
    }
  }
  if (requestedFormat) {
    if (requestedFormat === "article" && metadata.format === "video") return json({ error:"video_link_selected_as_article" }, 400);
    if (requestedFormat === "video" && metadata.format === "article" && sourceAdapter(url) === "x") issues.push("尚未从 X 页面确认是否包含视频；请在审核预览中核对播放器。");
    metadata.format = requestedFormat;
    if (requestedFormat === "video" && !metadata.video_url && videoPlayback(url)) metadata.video_url = url;
    if (requestedFormat === "article") metadata.video_url = "";
  }
  const media = await mirrorArticleMedia(metadata, env);
  metadata.body = media.body;
  metadata.cover_url = media.cover_url;
  issues.push(...media.missing);
  if (!metadata.summary && sourceBody) metadata.summary = sourceBody.replace(/^!\[[^\]]*\]\([^\n]+\)$/gm, "").replace(/^[#>]\s*/gm, "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!metadata.title) issues.push("缺少原标题");
  if (!metadata.author || metadata.author === "@") issues.push("缺少作者 ID");
  if (metadata.format === "article" && !metadata.body) issues.push("缺少完整正文与图片顺序");
  if (metadata.format === "video" && !videoPlayback(metadata.video_url || url)) issues.push("未取得可站内播放的视频地址；抖音视频需使用完整视频链接以获取官方播放器");
  const ai = await enrich(metadata, env);
  if (!metadata.summary && !ai?.summary) issues.push("缺少首页卡片摘要");
  const rights = metadata.format === "video" && videoPlayback(metadata.video_url || url) ? "embed" : "licensed";
  const input = { ...metadata, ...ai, video_url:metadata.video_url || (rights === "embed" ? url : ""),
    card_title:ai?.card_title || metadata.title, category:ai?.category || "opportunity",
    rights, status:issues.length ? "needs_help" : "review", extraction_state:extraction,
    extraction_note:issues.join("\n"), original_body:sourceBody, rights_confirmed:false };
  const { article, error } = cleanArticle(input);
  if (error) return json({ error }, 400);
  const id = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const fields = ["source_url","source_name","author","published_at","format","category","rights","status","title","card_title","summary","cover_url","body","video_url","extraction_state","extraction_note","original_body","media_manifest","rights_confirmed"];
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO articles (id,${fields.join(",")}) VALUES (${["id", ...fields].map(() => "?").join(",")})`).bind(id, ...fields.map((key) => article[key])),
      env.DB.prepare("INSERT INTO article_versions (article_id,revision,snapshot) VALUES (?,?,?)").bind(id, 1, JSON.stringify({ id, ...article, revision:1 })),
      env.DB.prepare("INSERT INTO import_jobs (id,article_id,source_url,adapter,state,note) VALUES (?,?,?,?,?,?)").bind(jobId, id, url, sourceAdapter(url), article.status, article.extraction_note),
    ]);
    return json({ id, job_id:jobId, draft:{ id, revision:1, ...article }, extraction, issues, media:{ total:media.total, saved:media.saved }, ai_generated:Boolean(ai) }, 201);
  } catch { return json({ error:"import_save_failed" }, 503); }
}
