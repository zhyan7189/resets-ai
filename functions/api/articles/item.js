import { json, database } from "../../../lib/articles.js";

export async function onRequestGet({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ? AND status = 'published'").bind(id).first();
    if (!article) return json({ error:"not_found" }, 404);
    return json({ article });
  } catch { return json({ error:"article_unavailable" }, 503); }
}
