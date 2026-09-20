import { database, json } from "../../../lib/articles.js";

export async function onRequestPost({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  let ids;
  try { ids = (await request.json()).article_ids; } catch { return json({ error:"invalid_json" }, 400); }
  if (!Array.isArray(ids) || ids.length > 20 || ids.some((id) => typeof id !== "string" || !/^[a-z0-9-]{1,120}$/.test(id))) return json({ error:"invalid_article_ids" }, 400);
  try {
    for (const id of new Set(ids)) {
      await env.DB.prepare(`INSERT INTO article_metrics_daily (article_id,day,impressions) VALUES (?,date('now'),1)
        ON CONFLICT(article_id,day) DO UPDATE SET impressions=impressions+1`).bind(id).run();
    }
    return json({ ok:true });
  } catch { return json({ error:"analytics_unavailable" }, 503); }
}
