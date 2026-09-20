import { authorized, database, json } from "../../../lib/articles.js";

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  try {
    const status = await env.DB.prepare("SELECT status, COUNT(*) AS total FROM articles GROUP BY status").all();
    const reads = await env.DB.prepare("SELECT COALESCE(SUM(clicks),0) AS total FROM article_clicks").first();
    const popular = await env.DB.prepare(`SELECT a.id, a.card_title, a.title, c.clicks FROM articles a JOIN article_clicks c ON c.article_id=a.id WHERE a.status='published' ORDER BY c.clicks DESC,c.updated_at DESC LIMIT 1`).first();
    const jobs = await env.DB.prepare("SELECT j.id,j.article_id,j.source_url,j.adapter,j.state,j.note,j.created_at,a.status AS current_status FROM import_jobs j JOIN articles a ON a.id=j.article_id ORDER BY j.created_at DESC LIMIT 8").all();
    return json({ counts:Object.fromEntries((status.results || []).map((item) => [item.status, item.total])), total_reads:reads?.total || 0, popular:popular || null, jobs:jobs.results || [], integrations:{ d1:true, r2:Boolean(env.MEDIA), ai:Boolean(env.AI_API_KEY && env.AI_API_URL && env.AI_MODEL) } });
  } catch { return json({ error:"overview_unavailable" }, 503); }
}
