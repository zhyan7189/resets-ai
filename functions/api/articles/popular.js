function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequestGet({ env }) {
  try {
    if (!env?.DB) return json({ error:"analytics_unconfigured", article_id:null, clicks:0 }, 503);
    const row = await env.DB.prepare(`
      SELECT a.id AS article_id, a.source_name, a.author, a.published_at, a.format,
        a.category, a.title, a.card_title, a.summary, a.cover_url,
        COALESCE(c.clicks, 0) AS clicks
      FROM articles a LEFT JOIN article_clicks c ON c.article_id = a.id
      WHERE a.status = 'published'
      ORDER BY COALESCE(c.clicks, 0) DESC,
        COALESCE((SELECT MAX(created_at) FROM review_events WHERE article_id=a.id AND action='approve'), a.created_at) DESC,
        a.id ASC
      LIMIT 1
    `).first();
    const computedAt = new Date().toISOString();
    return json({
      article_id: row?.article_id || null,
      article: row ? { id:row.article_id, source_name:row.source_name, author:row.author, published_at:row.published_at,
        format:row.format, category:row.category, title:row.title, card_title:row.card_title,
        summary:row.summary, cover_url:row.cover_url } : null,
      clicks: Number(row?.clicks || 0),
      computed_at: computedAt,
      next_refresh_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch {
    return json({ error:"analytics_unavailable", article_id:null, clicks:0 }, 503);
  }
}
