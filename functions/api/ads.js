import { database, json } from "../../lib/articles.js";

export async function onRequestGet({ env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const now = new Date().toISOString().slice(0,16);
    const result = await env.DB.prepare(`SELECT slot,label,title,description,icon,target_url,starts_at,ends_at,active
      FROM ad_slots ORDER BY slot`).all();
    const rows = result.results || [];
    const ads = rows.filter((ad) => ad.active && ad.title && ad.target_url &&
      (!ad.starts_at || ad.starts_at <= now) && (!ad.ends_at || ad.ends_at > now))
      .map(({ slot,label,title,description,icon,target_url }) => ({ slot,label,title,description,icon,target_url }));
    return json({ ads, hidden_slots:rows.filter((ad) => !ad.active).map((ad) => ad.slot) });
  } catch { return json({ error:"ads_unavailable" }, 503); }
}
