import { authorized, database, json } from "../../../lib/articles.js";

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const result = await env.DB.prepare("SELECT revision,snapshot,saved_at FROM article_versions WHERE article_id=? ORDER BY revision DESC LIMIT 30").bind(id).all();
    return json({ versions:(result.results || []).map((row) => ({ revision:row.revision, saved_at:row.saved_at, article:JSON.parse(row.snapshot) })) });
  } catch { return json({ error:"versions_unavailable" }, 503); }
}
