import { authorized, cleanArticle, database, json } from "../../../lib/articles.js";

const FIELDS = ["source_url","source_name","author","published_at","format","category","rights","status","title","card_title","summary","cover_url","body","video_url","extraction_state","extraction_note","original_body","media_manifest","rights_confirmed"];

async function guard(request, env) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  return database(env);
}

function statement(db, sql, values) { return db.prepare(sql).bind(...values); }

export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  try {
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number.parseInt(params.get("page") || "1", 10) || 1));
    const pageSize = params.get("page_size") === "10" ? 10 : 20;
    const filters = [];
    const values = [];
    const status = params.get("status") || "";
    if (["draft","needs_help","review","rejected","published","archived","discarded"].includes(status)) { filters.push("a.status=?"); values.push(status); }
    const format = params.get("format") || "";
    if (["article","video"].includes(format)) { filters.push("a.format=?"); values.push(format); }
    const query = (params.get("q") || "").trim().slice(0, 100);
    if (query) { filters.push("(a.title LIKE ? OR a.card_title LIKE ? OR a.author LIKE ? OR a.source_url LIKE ?)"); values.push(...Array(4).fill(`%${query}%`)); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM articles a ${where}`).bind(...values).first();
    const result = await env.DB.prepare(`SELECT a.id, a.source_url, a.source_name, a.author, a.published_at, a.format,
      a.category, a.rights, a.status, a.title, a.card_title, a.summary, a.cover_url, a.video_url,
      a.extraction_state, a.extraction_note, a.revision, a.updated_at,
      COALESCE(c.clicks, 0) AS clicks
      FROM articles a LEFT JOIN article_clicks c ON c.article_id = a.id
      ${where} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize).all();
    return json({ articles:result.results || [], total:count?.total || 0, page, page_size:pageSize });
  } catch { return json({ error:"articles_unavailable" }, 503); }
}

export async function onRequestDelete({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const id = String(input?.id || "");
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const current = await env.DB.prepare("SELECT * FROM articles WHERE id=?").bind(id).first();
    if (!current) return json({ error:"not_found" }, 404);
    if (current.status === "discarded") return json({ error:"already_discarded" }, 409);
    if (Number(input.revision) !== current.revision) return json({ error:"revision_conflict" }, 409);
    const revision = current.revision + 1;
    await env.DB.batch([
      env.DB.prepare("UPDATE articles SET status='discarded',revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?").bind(revision, id, current.revision),
      env.DB.prepare("INSERT INTO article_versions (article_id,revision,snapshot) VALUES (?,?,?)").bind(id, revision, JSON.stringify({ ...current, status:"discarded", revision })),
    ]);
    return json({ id, status:"discarded", revision });
  } catch { return json({ error:"discard_unavailable" }, 503); }
}

export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const { article, error } = cleanArticle(input);
  if (error) return json({ error }, 400);
  const id = crypto.randomUUID();
  try {
    const columns = ["id", ...FIELDS];
    const saved = { id, ...article, revision:1 };
    await env.DB.batch([
      statement(env.DB, `INSERT INTO articles (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`, [id, ...FIELDS.map((key) => article[key])]),
      statement(env.DB, "INSERT INTO article_versions (article_id,revision,snapshot) VALUES (?,?,?)", [id, 1, JSON.stringify(saved)]),
    ]);
    return json({ id, revision:1 }, 201);
  } catch { return json({ error:"save_failed_or_duplicate_url" }, 409); }
}

export async function onRequestPut({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const id = String(input?.id || "");
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  const { article, error } = cleanArticle(input);
  if (error) return json({ error }, 400);
  try {
    const existing = await env.DB.prepare("SELECT revision FROM articles WHERE id = ?").bind(id).first();
    if (!existing) return json({ error:"not_found" }, 404);
    if (input.revision != null && Number(input.revision) !== existing.revision) return json({ error:"revision_conflict" }, 409);
    const revision = existing.revision + 1;
    const snapshot = JSON.stringify({ id, ...article, revision });
    await env.DB.batch([
      statement(env.DB, `UPDATE articles SET ${FIELDS.map((key) => `${key}=?`).join(",")},revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [...FIELDS.map((key) => article[key]), revision, id]),
      statement(env.DB, "INSERT INTO article_versions (article_id,revision,snapshot) VALUES (?,?,?)", [id, revision, snapshot]),
    ]);
    return json({ id, revision });
  } catch { return json({ error:"save_failed_or_duplicate_url" }, 409); }
}
