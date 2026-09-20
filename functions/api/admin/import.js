import { authorized, cleanArticle, cleanMediaUrl, cleanUrl, database, json, mediaManifest, videoPlayback } from "../../../lib/articles.js";

const decode = (value) => String(value || "")
  .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function sourceAdapter(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (["x.com", "twitter.com"].includes(host)) return "x";
  if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return "youtube";
  if (host === "bilibili.com" || host.endsWith(".bilibili.com")) return "bilibili";
  return "web";
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
  for (const match of safe.matchAll(/<(h[1-3]|p|blockquote|img)\b([^>]*)>([\s\S]*?)<\/\1>|<img\b([^>]*?)\/?\s*>/gi)) {
    const tag = (match[1] || "img").toLowerCase();
    if (tag === "img") { addImage(match[2] || match[4] || ""); continue; }
    const parts = String(match[3] || "").split(/(<img\b[^>]*\/?\s*>)/gi);
    for (const part of parts) {
      if (/^<img\b/i.test(part)) { addImage(part); continue; }
      const value = stripTags(part);
      if (value.length > 1) blocks.push(tag.startsWith("h") ? `${"#".repeat(Number(tag[1]))} ${value}` : tag === "blockquote" ? `> ${value}` : value);
    }
  }
  return blocks.join("\n\n").slice(0, 120000);
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
  const video = /(?:^|\.)youtube\.com$|^youtu\.be$/.test(origin.hostname) ? sourceUrl : "";
  return {
    source_url:sourceUrl,
    source_name:sourceAdapter(sourceUrl) === "x" ? "X" : meta["og:site_name"] || origin.hostname.replace(/^www\./, ""),
    author:meta.author || author || (sourceAdapter(sourceUrl) === "x" ? `@${origin.pathname.split("/").filter(Boolean)[0] || ""}` : ""),
    title:meta["og:title"] || meta["twitter:title"] || structured.headline || structured.name || title,
    summary:meta["og:description"] || meta["twitter:description"] || meta.description || structured.description || "",
    cover_url:image ? cleanUrl(new URL(image, sourceUrl).href) || "" : "",
    format:["youtube", "bilibili"].includes(sourceAdapter(sourceUrl)) || meta["og:type"] === "video.other" ? "video" : "article",
    published_at:meta["article:published_time"] || structured.datePublished || "",
    body,
    video_url:video,
  };
}

async function readLimited(response) {
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
  const urls = [...new Set(mediaManifest(metadata.format === "article" ? metadata.body : "", metadata.cover_url, "").map((item) => item.url))];
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
    body:metadata.body.replace(/^!\[([^\]]*)\]\(([^\s)]+)\)\s*$/gm, (raw, alt, url) => copied.has(url) ? `![${alt}](${copied.get(url)})` : raw),
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
  const url = cleanUrl(payload?.url);
  if (!url) return json({ error:"invalid_url" }, 400);
  try {
    const existing = await env.DB.prepare("SELECT id FROM articles WHERE source_url = ?").bind(url).first();
    if (existing) return json({ error:"duplicate_url", id:existing.id }, 409);
  } catch { return json({ error:"database_unavailable" }, 503); }
  let metadata = { source_url:url, source_name:new URL(url).hostname, author:"", title:"", summary:"", cover_url:"", published_at:"", format:["youtube", "bilibili"].includes(sourceAdapter(url)) || /\.mp4$/i.test(new URL(url).pathname) ? "video" : "article", body:"", video_url:videoPlayback(url) ? url : "" };
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
  const media = await mirrorArticleMedia(metadata, env);
  metadata.body = media.body;
  metadata.cover_url = media.cover_url;
  issues.push(...media.missing);
  if (!metadata.title) issues.push("缺少原标题");
  if (!metadata.author || metadata.author === "@") issues.push("缺少作者 ID");
  if (metadata.format === "article" && !metadata.body) issues.push("缺少完整正文与图片顺序");
  if (metadata.format === "video" && !videoPlayback(metadata.video_url || url)) issues.push("未取得可站内播放的视频地址");
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
