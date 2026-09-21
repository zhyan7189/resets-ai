import { database } from "../../../lib/articles.js";

const CACHE_CONTROL = "public, max-age=300, s-maxage=1800";

function response(body, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), { status, headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":cache,
    "x-content-type-options":"nosniff",
  } });
}

export async function onRequestGet({ env, request, waitUntil }) {
  const missing = database(env);
  if (missing) return missing;
  const edgeCache = typeof caches === "undefined" ? null : caches.default;
  const cacheKey = request && edgeCache
    ? new Request(new URL("/api/articles/teasers", request.url), { method:"GET" })
    : null;
  try {
    const cached = cacheKey ? await edgeCache.match(cacheKey) : null;
    if (cached) return cached;
    const result = await env.DB.prepare(`SELECT id,category,title,card_title,cover_url
      FROM articles WHERE status='published'
      ORDER BY COALESCE((SELECT MAX(created_at) FROM review_events WHERE article_id=articles.id AND action='approve'),created_at) DESC,id ASC
      LIMIT 6`).all();
    const fresh = response({ articles:result.results || [] }, 200, CACHE_CONTROL);
    if (cacheKey) {
      const write = edgeCache.put(cacheKey, fresh.clone());
      if (waitUntil) waitUntil(write); else await write;
    }
    return fresh;
  } catch { return response({ error:"articles_unavailable" }, 503); }
}
