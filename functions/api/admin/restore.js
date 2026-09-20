import { authorized, database, json } from "../../../lib/articles.js";

export async function onRequestPost({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const id = String(input?.id || "");
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const current = await env.DB.prepare("SELECT * FROM articles WHERE id=?").bind(id).first();
    if (!current) return json({ error:"not_found" }, 404);
    if (current.status !== "discarded") return json({ error:"not_discarded" }, 409);
    if (Number(input.revision) !== current.revision) return json({ error:"revision_conflict" }, 409);
    const previous = await env.DB.prepare("SELECT snapshot FROM article_versions WHERE article_id=? AND revision=?").bind(id, current.revision - 1).first();
    let status = "draft";
    try {
      const saved = JSON.parse(previous?.snapshot || "{}").status;
      if (["draft","needs_help","review","rejected","published","archived"].includes(saved)) status = saved;
    } catch { /* 旧版快照缺失时恢复为草稿。 */ }
    const revision = current.revision + 1;
    await env.DB.batch([
      env.DB.prepare("UPDATE articles SET status=?,revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?").bind(status, revision, id, current.revision),
      env.DB.prepare("INSERT INTO article_versions (article_id,revision,snapshot) VALUES (?,?,?)").bind(id, revision, JSON.stringify({ ...current, status, revision })),
    ]);
    return json({ id, status, revision });
  } catch { return json({ error:"restore_unavailable" }, 503); }
}
