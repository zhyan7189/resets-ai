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
    let analytics = { ready:false, total_visits:null, visits:[], reads:[], visitors:[], registrations:[], visitor_summary:null, registration_summary:null, heat:[], ctr:[] };
    try {
      const visits = await env.DB.prepare("SELECT day,pageviews FROM site_visits_daily WHERE day>=date('now','-29 days') ORDER BY day").all();
      const total = await env.DB.prepare("SELECT COALESCE(SUM(pageviews),0) AS total FROM site_visits_daily").first();
      const dailyReads = await env.DB.prepare("SELECT day,SUM(clicks) AS clicks FROM article_metrics_daily WHERE day>=date('now','-29 days') GROUP BY day ORDER BY day").all();
      const visitors = await env.DB.prepare("SELECT first_seen_day AS day,COUNT(*) AS new_visitors FROM site_visitors WHERE first_seen_day>=date('now','-364 days') GROUP BY first_seen_day ORDER BY first_seen_day").all();
      const registrations = await env.DB.prepare("SELECT date(created_at) AS day,COUNT(*) AS new_users FROM reader_users WHERE date(created_at)>=date('now','-364 days') GROUP BY date(created_at) ORDER BY day").all();
      const visitorSummary = await env.DB.prepare(`SELECT
        SUM(CASE WHEN first_seen_day=date('now') THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN first_seen_day>=date('now','-6 days') THEN 1 ELSE 0 END) AS week,
        SUM(CASE WHEN first_seen_day>=date('now','start of month') THEN 1 ELSE 0 END) AS month,
        COUNT(*) AS total FROM site_visitors`).first();
      const registrationSummary = await env.DB.prepare(`SELECT
        SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN date(created_at)>=date('now','-6 days') THEN 1 ELSE 0 END) AS week,
        SUM(CASE WHEN date(created_at)>=date('now','start of month') THEN 1 ELSE 0 END) AS month,
        COUNT(*) AS total FROM reader_users`).first();
      const ranked = await env.DB.prepare(`SELECT a.id,a.card_title,a.title,SUM(m.clicks) AS clicks,SUM(m.impressions) AS impressions
        FROM article_metrics_daily m JOIN articles a ON a.id=m.article_id
        WHERE a.status='published' AND m.day>=date('now','-6 days')
        GROUP BY a.id ORDER BY clicks DESC LIMIT 20`).all();
      const heat = ranked.results || [];
      analytics = { ready:true, total_visits:total?.total || 0, visits:visits.results || [], reads:dailyReads.results || [],
        visitors:visitors.results || [], registrations:registrations.results || [],
        visitor_summary:visitorSummary || { today:0, week:0, month:0, total:0 },
        registration_summary:registrationSummary || { today:0, week:0, month:0, total:0 },
        heat:heat.slice(0, 8), ctr:heat.filter((item) => Number(item.impressions) >= 20)
          .sort((a, b) => b.clicks / b.impressions - a.clicks / a.impressions).slice(0, 8) };
    } catch { /* 新统计表尚未迁移时仍展示既有控制台数据。 */ }
    return json({ counts:Object.fromEntries((status.results || []).map((item) => [item.status, item.total])), total_reads:reads?.total || 0, popular:popular || null, jobs:jobs.results || [], analytics, integrations:{ d1:true, r2:Boolean(env.MEDIA), ai:Boolean(env.AI_API_KEY && env.AI_API_URL && env.AI_MODEL) } });
  } catch { return json({ error:"overview_unavailable" }, 503); }
}
