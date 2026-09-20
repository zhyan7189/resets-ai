import { authorized, database, json } from "../../../lib/articles.js";
import { extractArticleBody, extractXEmbed, mergeEmbeddedVideos, mergeXEmbedBody, readLimited, sourceAdapter } from "./import.js";

export async function onRequestPost({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const id = String(input?.id || "");
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const article = await env.DB.prepare("SELECT source_url,original_body,body,summary FROM articles WHERE id=?").bind(id).first();
    if (!article) return json({ error:"not_found" }, 404);
    if (sourceAdapter(article.source_url) !== "x") return json({ error:"unsupported_source" }, 400);
    try {
      const page = await fetch(article.source_url, { redirect:"manual", headers:{ accept:"text/html", "user-agent":"ResetsAI/1.0 (+content preview)" }, signal:AbortSignal.timeout(8000) });
      if (page.ok && /text\/html/i.test(page.headers.get("content-type") || "")) {
        const { html, truncated } = await readLimited(page);
        const extracted = truncated ? "" : extractArticleBody(html, article.source_url);
        if (/@\[[^\]\n]*\]\(https:\/\/[^\s)]+\.mp4(?:\?[^\s)]*)?\)/i.test(extracted)) {
          const body = article.body ? mergeEmbeddedVideos(article.body, extracted) : extracted;
          return json({ summary:article.summary, original_body:article.original_body ? mergeEmbeddedVideos(article.original_body, extracted) : extracted,
            body, video_added:body !== article.body });
        }
      }
    } catch { /* 页面不可读取时继续尝试 X 官方嵌入文字。 */ }
    const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(article.source_url)}&omit_script=true`;
    const response = await fetch(endpoint, { signal:AbortSignal.timeout(8000) });
    if (!response.ok) return json({ error:"source_unavailable" }, 502);
    const embed = extractXEmbed(await response.json(), article.source_url);
    if (!embed?.body) return json({ error:"source_text_unavailable" }, 502);
    return json({ summary:article.summary || embed.summary, original_body:mergeXEmbedBody(article.original_body, embed.body), body:mergeXEmbedBody(article.body, embed.body) });
  } catch { return json({ error:"source_unavailable" }, 502); }
}
