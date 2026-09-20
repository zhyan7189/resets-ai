import { authorized, database, json } from "../../../lib/articles.js";

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  try {
    if (id) {
      if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
      const article = await env.DB.prepare(`SELECT a.id,'DA' || ai.number AS archive_code,a.title,a.card_title,a.status,a.author,a.created_at,a.updated_at,a.source_url,
        COALESCE(c.clicks,0) AS clicks,COALESCE(m.impressions,0) AS impressions,
        CASE WHEN COALESCE(m.impressions,0)>=20 THEN ROUND(100.0*m.clicks/m.impressions,1) END AS ctr_percent,
        CAST(julianday('now')-julianday(a.created_at) AS INTEGER) AS retained_days
        FROM articles a LEFT JOIN archive_ids ai ON ai.article_id=a.id LEFT JOIN article_clicks c ON c.article_id=a.id
        LEFT JOIN (SELECT article_id,SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM article_metrics_daily GROUP BY article_id) m ON m.article_id=a.id
        WHERE a.id=?`).bind(id).first();
      if (!article) return json({ error:"not_found" }, 404);
      const reviews = await env.DB.prepare("SELECT action,note,revision,created_at FROM review_events WHERE article_id=? ORDER BY created_at DESC LIMIT 30").bind(id).all();
      const imports = await env.DB.prepare("SELECT adapter,state,note,created_at FROM import_jobs WHERE article_id=? ORDER BY created_at DESC LIMIT 30").bind(id).all();
      return json({ article, reviews:reviews.results || [], imports:imports.results || [] });
    }
    const page = Math.max(1, Math.min(10000, Number.parseInt(params.get("page") || "1", 10) || 1));
    const pageSize = params.get("page_size") === "20" ? 20 : 10;
    const query = (params.get("q") || "").trim().slice(0, 100);
    const allowedStatuses = new Set(["draft","needs_help","review","rejected","published","archived","discarded"]);
    const status = allowedStatuses.has(params.get("status")) ? params.get("status") : "";
    const sortOptions = {
      archive_asc:"ai.number ASC",
      newest:"a.created_at DESC,ai.number DESC",
      recent_activity:"a.updated_at DESC,a.id DESC",
      most_read:"COALESCE(c.clicks,0) DESC,a.created_at DESC",
      highest_ctr:"CASE WHEN COALESCE(m.impressions,0)>=20 THEN 1.0*m.clicks/m.impressions ELSE -1 END DESC,COALESCE(m.impressions,0) DESC,a.created_at DESC",
      longest:"a.created_at ASC,a.id ASC",
    };
    const order = sortOptions[params.get("sort")] || sortOptions.archive_asc;
    const search = query ? "%" + query + "%" : "%";
    const where = `WHERE (a.title LIKE ? OR a.card_title LIKE ? OR ('DA' || ai.number) LIKE ?)${status ? " AND a.status=?" : ""}`;
    const bindings = [search, search, search, ...(status ? [status] : [])];
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM articles a LEFT JOIN archive_ids ai ON ai.article_id=a.id ${where}`).bind(...bindings).first();
    const rows = await env.DB.prepare(`SELECT a.id,'DA' || ai.number AS archive_code,a.title,a.card_title,a.status,a.author,a.created_at,a.updated_at,
      COALESCE(c.clicks,0) AS clicks,COALESCE(m.impressions,0) AS impressions,
      CASE WHEN COALESCE(m.impressions,0)>=20 THEN ROUND(100.0*m.clicks/m.impressions,1) END AS ctr_percent,
      CAST(julianday('now')-julianday(a.created_at) AS INTEGER) AS retained_days
      FROM articles a LEFT JOIN archive_ids ai ON ai.article_id=a.id LEFT JOIN article_clicks c ON c.article_id=a.id
      LEFT JOIN (SELECT article_id,SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM article_metrics_daily GROUP BY article_id) m ON m.article_id=a.id
      ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (page - 1) * pageSize).all();
    return json({ rows:rows.results || [], total:count?.total || 0, page, page_size:pageSize });
  } catch { return json({ error:"operations_unavailable" }, 503); }
}
