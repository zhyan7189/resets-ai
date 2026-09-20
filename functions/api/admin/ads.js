import { authorized, cleanUrl, database, json } from "../../../lib/articles.js";

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  try {
    const result = await env.DB.prepare("SELECT slot,label,title,description,icon,target_url,starts_at,ends_at,active,updated_at FROM ad_slots ORDER BY slot").all();
    return json({ ads:result.results || [] });
  } catch { return json({ error:"ads_unavailable" }, 503); }
}

export async function onRequestPut({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const slot = Number(input?.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) return json({ error:"invalid_slot" }, 400);
  const clean = (value, max) => String(value || "").trim().slice(0, max);
  const ad = {
    slot, label:clean(input.label, 50), title:clean(input.title, 100), description:clean(input.description, 120),
    icon:clean(input.icon, 4) || "✦", target_url:input.target_url ? cleanUrl(input.target_url) : "",
    starts_at:clean(input.starts_at, 25), ends_at:clean(input.ends_at, 25), active:input.active === true ? 1 : 0,
  };
  if (input.target_url && !ad.target_url) return json({ error:"invalid_target_url" }, 400);
  if (ad.active && (!ad.title || !ad.target_url)) return json({ error:"ad_fields_required" }, 400);
  const validDate = (value) => !value || (/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) && !Number.isNaN(Date.parse(`${value}Z`)) && new Date(`${value}Z`).toISOString().startsWith(value));
  if (!validDate(ad.starts_at) || !validDate(ad.ends_at)) return json({ error:"invalid_ad_dates" }, 400);
  if (ad.starts_at && ad.ends_at && ad.starts_at >= ad.ends_at) return json({ error:"invalid_ad_dates" }, 400);
  try {
    await env.DB.prepare(`INSERT INTO ad_slots (slot,label,title,description,icon,target_url,starts_at,ends_at,active)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET label=excluded.label,title=excluded.title,
      description=excluded.description,icon=excluded.icon,target_url=excluded.target_url,
      starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active,updated_at=CURRENT_TIMESTAMP`)
      .bind(...Object.values(ad)).run();
    return json({ ok:true, slot });
  } catch { return json({ error:"ad_save_failed" }, 503); }
}
