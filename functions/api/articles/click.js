const ARTICLE_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;

function json(body, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();
    const articleId = typeof payload?.article_id === "string" ? payload.article_id : "";
    if (!ARTICLE_ID.test(articleId)) return json({ error:"invalid_article_id" }, 400);
    if (!env?.DB) return json({ error:"analytics_unconfigured" }, 503);

    await env.DB.prepare(`
      INSERT INTO article_clicks (article_id, clicks, updated_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(article_id) DO UPDATE SET
        clicks = article_clicks.clicks + 1,
        updated_at = CURRENT_TIMESTAMP
    `).bind(articleId).run();
    try {
      await env.DB.prepare(`INSERT INTO article_metrics_daily (article_id,day,clicks) VALUES (?,date('now'),1)
        ON CONFLICT(article_id,day) DO UPDATE SET clicks=clicks+1`).bind(articleId).run();
    } catch { /* 旧库尚未升级时仍保留原有累计点击统计。 */ }
    return json({ ok:true, article_id:articleId });
  } catch {
    return json({ error:"analytics_unavailable" }, 503);
  }
}
