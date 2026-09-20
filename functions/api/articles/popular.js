function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=3600, s-maxage=3600" : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequestGet({ env }) {
  try {
    if (!env?.DB) return json({ error:"analytics_unconfigured", article_id:null, clicks:0 }, 503);
    const row = await env.DB.prepare(`
      SELECT article_id, clicks, updated_at
      FROM article_clicks
      WHERE article_id IN ('stripe-ai-pricing','xilo-codex-editing','cloudflare-workers-ai','zapier-ai-automation')
        OR EXISTS (SELECT 1 FROM articles WHERE articles.id = article_clicks.article_id AND articles.status = 'published')
      ORDER BY clicks DESC, updated_at DESC, article_id ASC
      LIMIT 1
    `).first();
    const computedAt = new Date().toISOString();
    return json({
      article_id: row?.article_id || null,
      clicks: Number.isSafeInteger(row?.clicks) ? row.clicks : 0,
      computed_at: computedAt,
      next_refresh_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch {
    return json({ error:"analytics_unavailable", article_id:null, clicks:0 }, 503);
  }
}
