import { database, json } from "../../lib/articles.js";

export async function onRequestGet({ env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const now = new Date().toISOString().slice(0,16);
    const result = await env.DB.prepare(`SELECT slot,label,title,description,icon,target_url FROM ad_slots
      WHERE active=1 AND (starts_at='' OR starts_at<=?) AND (ends_at='' OR ends_at>?) ORDER BY slot`).bind(now, now).all();
    return json({ ads:result.results || [] });
  } catch { return json({ error:"ads_unavailable" }, 503); }
}
