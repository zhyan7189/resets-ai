export const CATEGORIES = ["opportunity", "tutorial", "tools", "case", "pitfall"];
export const RIGHTS = ["summary", "embed", "licensed"];
export const STATUSES = ["draft", "needs_help", "review", "published", "archived"];
export const EXTRACTION_STATES = ["manual", "metadata", "complete", "partial", "blocked"];

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
  } });
}

export async function authorized(request, env) {
  const expected = env?.ADMIN_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /i, "") || "";
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(expected)), crypto.subtle.digest("SHA-256", encoder.encode(supplied))]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function cleanUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":") || !host.includes(".")) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|igshid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return null; }
}

export function cleanMediaUrl(value) {
  if (typeof value === "string" && /^\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/.test(value)) return value;
  return cleanUrl(value);
}

export function videoPlayback(value) {
  const safe = cleanUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  let id = "";
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) id = url.searchParams.get("v") || "";
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return { type:"embed", url:`https://www.youtube-nocookie.com/embed/${id}` };
  if (/\.mp4$/i.test(url.pathname)) return { type:"video", url:safe };
  return null;
}

export function mediaManifest(body, coverUrl, videoUrl) {
  const items = [];
  if (coverUrl) items.push({ type:"cover", url:coverUrl });
  for (const match of String(body || "").matchAll(/^!\[([^\]]*)\]\(([^\s)]+)\)\s*$/gm)) {
    const url = cleanMediaUrl(match[2]);
    if (url) items.push({ type:"image", url, alt:match[1], order:items.length });
  }
  if (videoUrl) items.push({ type:"video", url:videoUrl });
  return items;
}

export function cleanArticle(input) {
  if (!input || typeof input !== "object") return { error:"invalid_article" };
  const text = (value, max) => String(value ?? "").trim().slice(0, max);
  const sourceUrl = cleanUrl(input?.source_url);
  if (!sourceUrl) return { error:"invalid_source_url" };
  const article = {
    source_url:sourceUrl,
    source_name:text(input.source_name, 100),
    author:text(input.author, 100),
    published_at:text(input.published_at, 30),
    format:input.format === "video" ? "video" : "article",
    category:CATEGORIES.includes(input.category) ? input.category : "opportunity",
    rights:RIGHTS.includes(input.rights) ? input.rights : "summary",
    status:STATUSES.includes(input.status) ? input.status : "draft",
    title:text(input.title, 300),
    card_title:text(input.card_title, 180),
    summary:text(input.summary, 500),
    cover_url:input.cover_url ? cleanMediaUrl(input.cover_url) : "",
    body:text(input.body, 120000),
    video_url:input.video_url ? cleanUrl(input.video_url) : "",
    extraction_state:EXTRACTION_STATES.includes(input.extraction_state) ? input.extraction_state : "manual",
    extraction_note:text(input.extraction_note, 1000),
    original_body:text(input.original_body, 120000),
    media_manifest:"[]",
    rights_confirmed:input.rights_confirmed === true || input.rights_confirmed === 1 || input.rights_confirmed === "on" ? 1 : 0,
  };
  if (input.cover_url && !article.cover_url) return { error:"invalid_cover_url" };
  if (input.video_url && !article.video_url) return { error:"invalid_video_url" };
  if (article.status === "published" && (!article.title || !article.summary || !article.source_name || !article.author)) return { error:"publication_fields_required" };
  if (article.rights !== "licensed") article.body = "";
  if (article.rights === "embed" && article.format !== "video") return { error:"embed_requires_video" };
  if (article.status === "published" && article.rights === "embed" && !article.video_url) return { error:"embed_video_required" };
  if (article.status === "published" && article.rights === "embed" && !videoPlayback(article.video_url)) return { error:"video_not_playable" };
  if (article.status === "published" && article.rights === "licensed" && !article.body) return { error:"licensed_body_required" };
  if (article.status === "published" && ["licensed", "embed"].includes(article.rights) && !article.rights_confirmed) return { error:"rights_confirmation_required" };
  article.media_manifest = JSON.stringify(mediaManifest(article.body, article.cover_url, article.video_url));
  return { article };
}

export function database(env) {
  return env?.DB ? null : json({ error:"database_unconfigured" }, 503);
}
