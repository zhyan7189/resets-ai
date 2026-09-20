import { authorized, cleanArticle, database, json } from "../../../lib/articles.js";

export async function onRequestPost({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const id = String(input?.id || "");
  const action = input?.action;
  const note = String(input?.note || "").trim().slice(0, 1000);
  if (!/^[a-z0-9-]{1,120}$/.test(id) || !["approve", "reject", "archive"].includes(action)) return json({ error:"invalid_review" }, 400);
  if (action === "reject" && !note) return json({ error:"review_note_required" }, 400);
  try {
    const current = await env.DB.prepare("SELECT * FROM articles WHERE id=?").bind(id).first();
    if (!current) return json({ error:"not_found" }, 404);
    if (current.status !== (action === "archive" ? "published" : "review")) return json({ error:"not_in_review" }, 409);
    if (Number(input.revision) !== current.revision) return json({ error:"revision_conflict" }, 409);
    const status = action === "approve" ? "published" : action === "reject" ? "rejected" : "archived";
    if (action === "approve") {
      const checked = cleanArticle({ ...current, status });
      if (checked.error) return json({ error:checked.error }, 400);
    }
    const revision = current.revision + 1;
    await env.DB.batch([
      env.DB.prepare("UPDATE articles SET status=?,revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?").bind(status, revision, id, current.revision),
      env.DB.prepare("INSERT INTO article_versions (article_id,revision,snapshot) VALUES (?,?,?)").bind(id, revision, JSON.stringify({ ...current, status, revision })),
      env.DB.prepare("INSERT INTO review_events (id,article_id,action,note,revision) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, action, note, revision),
    ]);
    return json({ id, status, revision });
  } catch { return json({ error:"review_unavailable" }, 503); }
}
