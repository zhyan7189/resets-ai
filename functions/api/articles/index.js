import { json, database } from "../../../lib/articles.js";

export async function onRequestGet({ env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const result = await env.DB.prepare(`SELECT id, source_url, source_name, author, published_at, format, category, rights,
      title, card_title, summary, cover_url, updated_at FROM articles WHERE status = 'published' ORDER BY updated_at DESC LIMIT 100`).all();
    return json({ articles:result.results || [] });
  } catch { return json({ error:"articles_unavailable" }, 503); }
}
