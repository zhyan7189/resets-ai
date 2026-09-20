import { database, json } from "../../../lib/articles.js";

export async function onRequestPost({ env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    await env.DB.prepare(`INSERT INTO site_visits_daily (day,pageviews) VALUES (date('now'),1)
      ON CONFLICT(day) DO UPDATE SET pageviews=pageviews+1`).run();
    return json({ ok:true });
  } catch { return json({ error:"analytics_unavailable" }, 503); }
}
