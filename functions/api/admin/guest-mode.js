import { authorized, database, json } from "../../../lib/articles.js";
import { guestLimitEnabled } from "../../../lib/site-settings.js";

async function guard(request, env) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  return database(env);
}

export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  return json({ enabled:await guestLimitEnabled(env.DB) });
}

export async function onRequestPut({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  if (typeof input?.enabled !== "boolean") return json({ error:"invalid_setting" }, 400);
  try {
    await env.DB.prepare("INSERT INTO site_settings (key,value) VALUES ('guest_limit_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(input.enabled ? "1" : "0").run();
    return json({ enabled:input.enabled });
  } catch { return json({ error:"settings_unavailable" }, 503); }
}
