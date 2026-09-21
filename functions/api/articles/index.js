import { json, database } from "../../../lib/articles.js";
import { reader } from "../../../lib/readers.js";
import { guestLimitEnabled } from "../../../lib/site-settings.js";

export async function onRequestGet({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const user = await reader(request, env);
    const result = await env.DB.prepare(`SELECT a.id, a.source_url, a.source_name, a.author, a.published_at, a.format,
      a.category, a.rights, a.title, a.card_title, a.summary, a.cover_url, a.updated_at,
      COALESCE(hourly.clicks, 0) AS clicks_24h,
      COALESCE(weekly.clicks, 0) AS clicks_7d,
      COALESCE(total.clicks, 0) AS clicks_total,
      strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(
        (SELECT MAX(created_at) FROM review_events WHERE article_id=a.id AND action='approve'), a.created_at
      )) AS published_sort_at
      FROM articles a
      LEFT JOIN article_clicks total ON total.article_id=a.id
      LEFT JOIN (
        SELECT article_id, SUM(clicks) AS clicks FROM article_clicks_hourly
        WHERE hour >= strftime('%Y-%m-%dT%H:00:00Z','now','-23 hours') GROUP BY article_id
      ) hourly ON hourly.article_id=a.id
      LEFT JOIN (
        SELECT article_id, SUM(clicks) AS clicks FROM article_metrics_daily
        WHERE day >= date('now','-6 days') GROUP BY article_id
      ) weekly ON weekly.article_id=a.id
      WHERE a.status = 'published'
      ORDER BY published_sort_at DESC, a.id ASC`).all();
    const articles = result.results || [];
    return json({ articles, limited:!user && await guestLimitEnabled(env.DB), free_article_id:null });
  } catch { return json({ error:"articles_unavailable" }, 503); }
}
