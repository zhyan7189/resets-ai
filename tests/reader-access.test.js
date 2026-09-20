import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost as register } from "../functions/api/reader/register.js";
import { onRequestPost as login } from "../functions/api/reader/login.js";
import { onRequestPost as logout } from "../functions/api/reader/logout.js";
import { onRequestGet as session } from "../functions/api/reader/session.js";
import { onRequestGet as list } from "../functions/api/articles/index.js";
import { onRequestGet as item } from "../functions/api/articles/item.js";
import { onRequestGet as operations } from "../functions/api/admin/operations.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  const env = { ADMIN_TOKEN:"test-admin", DB:{ prepare(sql) {
    const statement = sqlite.prepare(sql);
    const wrap = (...values) => ({ first:async () => statement.get(...values) || null, all:async () => ({ results:statement.all(...values) }), run:async () => statement.run(...values) });
    return { bind:wrap, ...wrap() };
  } } };
  for (let n = 1; n <= 7; n++) {
    sqlite.prepare("INSERT INTO articles (id,source_url,title,author,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(`archive-${n}`, `https://example.org/${n}`, `档案 ${n}`, "writer", "published", `2026-09-${String(n).padStart(2,"0")}`, `2026-09-${String(n).padStart(2,"0")}`);
  }
  return { env, sqlite };
}

const req = (path, options = {}) => new Request(`https://example.com${path}`, options);
const post = (path, body, cookie = "") => req(path, { method:"POST", headers:{ origin:"https://example.com", "content-type":"application/json", ...(cookie ? { cookie } : {}) }, body:JSON.stringify(body) });

test("访客固定只看最新一篇，直达旧档案被服务端拒绝；读者注册后不限篇数", async () => {
  const { env, sqlite } = fixture();
  const publicList = await list({ request:req("/api/articles"), env });
  assert.deepEqual((await publicList.json()).articles.map((row) => row.id), ["archive-7"]);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1"), env })).status, 403);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-6"), env })).status, 403);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-7"), env })).status, 200);
  const created = await register({ request:post("/api/reader/register", { username:"reader_1", password:"a long reader password" }), env });
  assert.equal(created.status, 201);
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const stored = sqlite.prepare("SELECT password_hash,password_salt FROM reader_users WHERE username=?").get("reader_1");
  assert.notEqual(stored.password_hash, "a long reader password");
  assert.equal(stored.password_hash.length, 64);
  assert.equal((await (await session({ request:req("/api/reader/session", { headers:{ cookie } }), env })).json()).username, "reader_1");
  assert.equal((await (await list({ request:req("/api/articles", { headers:{ cookie } }), env })).json()).articles.length, 7);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1", { headers:{ cookie } }), env })).status, 200);
  const ended = await logout({ request:post("/api/reader/logout", {}, cookie), env });
  assert.equal(ended.status, 200);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1", { headers:{ cookie } }), env })).status, 403);
});

test("读者登录拒绝错误密码与跨站请求，档案 ID 稳定且运营列表可查", async () => {
  const { env, sqlite } = fixture();
  assert.equal((await register({ request:post("/api/reader/register", { username:"admin", password:"a long reader password" }), env })).status, 400);
  await register({ request:post("/api/reader/register", { username:"reader_2", password:"a long reader password" }), env });
  assert.equal((await login({ request:post("/api/reader/login", { username:"reader_2", password:"wrong password" }), env })).status, 401);
  assert.equal((await login({ request:req("/api/reader/login", { method:"POST", headers:{ origin:"https://evil.example" }, body:"{}" }), env })).status, 403);
  assert.equal((await login({ request:post("/api/reader/login", { username:"reader_2", password:"a long reader password" }), env })).status, 200);
  assert.deepEqual(sqlite.prepare("SELECT article_id,number FROM archive_ids ORDER BY number").all().map((row) => row.article_id),
    Array.from({ length:7 }, (_, i) => `archive-${i+1}`));
  const response = await operations({ request:req("/api/admin/operations?q=DA1", { headers:{ authorization:"Bearer test-admin" } }), env });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows[0].archive_code, "DA1");
});

test("注册密码至少七位，不限制字符类型或 128 位上限", async () => {
  const { env } = fixture();
  assert.equal((await register({ request:post("/api/reader/register", { username:"reader_short", password:"123456" }), env })).status, 400);
  assert.equal((await register({ request:post("/api/reader/register", { username:"reader_seven", password:"1234567" }), env })).status, 201);
  const longPassword = "文".repeat(129);
  assert.equal((await register({ request:post("/api/reader/register", { username:"reader_long", password:longPassword }), env })).status, 201);
  assert.equal((await login({ request:post("/api/reader/login", { username:"reader_long", password:longPassword }), env })).status, 200);
});

test("003 迁移为旧档案补永久编号，重复执行不改变编号", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE articles(id TEXT PRIMARY KEY,created_at TEXT NOT NULL)");
  sqlite.exec("INSERT INTO articles VALUES ('old-b','2026-09-02'),('old-a','2026-09-01')");
  const migration = readFileSync(new URL("../db/migrations/003-reader-archives.sql", import.meta.url), "utf8");
  sqlite.exec(migration);
  sqlite.exec(migration);
  assert.deepEqual(sqlite.prepare("SELECT article_id,number FROM archive_ids ORDER BY number").all().map((row) => ({ ...row })),
    [{ article_id:"old-a", number:1 }, { article_id:"old-b", number:2 }]);
  sqlite.exec("INSERT INTO articles VALUES ('new','2026-09-03')");
  assert.equal(sqlite.prepare("SELECT number FROM archive_ids WHERE article_id='new'").get().number, 3);
});
