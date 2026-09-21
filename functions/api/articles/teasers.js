import { database, json } from "../../../lib/articles.js";

export async function onRequestGet({ env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const result = await env.DB.prepare(`SELECT id,category,title,card_title,cover_url
      FROM articles WHERE status='published'
      ORDER BY COALESCE((SELECT MAX(created_at) FROM review_events WHERE article_id=articles.id AND action='approve'),created_at) DESC,id ASC
      LIMIT 6`).all();
    return json({ articles:result.results || [] });
  } catch { return json({ error:"articles_unavailable" }, 503); }
}
