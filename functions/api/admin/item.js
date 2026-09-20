import { authorized, database, json } from "../../../lib/articles.js";

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const article = await env.DB.prepare("SELECT a.*, 'DA' || ai.number AS archive_code FROM articles a LEFT JOIN archive_ids ai ON ai.article_id=a.id WHERE a.id = ?").bind(id).first();
    return article ? json({ article }) : json({ error:"not_found" }, 404);
  } catch { return json({ error:"article_unavailable" }, 503); }
}
