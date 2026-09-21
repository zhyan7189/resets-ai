import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost as register } from "../functions/api/reader/register.js";
import { onRequestPost as login } from "../functions/api/reader/login.js";
import { onRequestPost as logout } from "../functions/api/reader/logout.js";
import { onRequestGet as session } from "../functions/api/reader/session.js";
import { onRequestGet as list } from "../functions/api/articles/index.js";
import { onRequestGet as teasers } from "../functions/api/articles/teasers.js";
import { onRequestGet as item } from "../functions/api/articles/item.js";
import { onRequestGet as operations } from "../functions/api/admin/operations.js";
import { onRequestGet as getGuestMode, onRequestPut as saveGuestMode } from "../functions/api/admin/guest-mode.js";
import { onRequest as accessGate } from "../functions/_middleware.js";
import { onRequestPost as trackVisit } from "../functions/api/analytics/visit.js";
import { onRequestGet as overview } from "../functions/api/admin/overview.js";

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

test("开启游客门禁后正文要求登录；邮箱注册会自动建立会话", async () => {
  const { env, sqlite } = fixture();
  const publicList = await list({ request:req("/api/articles"), env });
  const publicData = await publicList.json();
  assert.deepEqual(publicData.articles.map((row) => row.id), Array.from({ length:7 }, (_, i) => `archive-${7-i}`));
  assert.equal(publicData.free_article_id, null);
  assert.equal(publicData.limited, true);
  assert.equal((await (await teasers({ env })).json()).articles.length, 6);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1"), env })).status, 403);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-7"), env })).status, 403);
  const created = await register({ request:post("/api/reader/register", { email:"Reader@One.Example", password:"a long reader password" }), env });
  assert.equal(created.status, 201);
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const stored = sqlite.prepare("SELECT email,password_hash,password_salt FROM reader_users WHERE email=?").get("reader@one.example");
  assert.equal(stored.email, "reader@one.example");
  assert.notEqual(stored.password_hash, "a long reader password");
  assert.equal(stored.password_hash.length, 64);
  assert.equal((await (await session({ request:req("/api/reader/session", { headers:{ cookie } }), env })).json()).email, "reader@one.example");
  const readerList = await (await list({ request:req("/api/articles", { headers:{ cookie } }), env })).json();
  assert.equal(readerList.articles.length, 7);
  assert.equal(readerList.limited, false);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1", { headers:{ cookie } }), env })).status, 200);
  const ended = await logout({ request:post("/api/reader/logout", {}, cookie), env });
  assert.equal(ended.status, 200);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1", { headers:{ cookie } }), env })).status, 403);
});

test("游客访问开关仅管理员可修改，关闭后全部公开，重新开启后要求登录", async () => {
  const { env } = fixture();
  const admin = { authorization:"Bearer test-admin", "content-type":"application/json" };
  assert.equal((await (await getGuestMode({ request:req("/api/admin/guest-mode", { headers:admin }), env })).json()).enabled, true);
  assert.equal((await saveGuestMode({ request:req("/api/admin/guest-mode", { method:"PUT", body:'{"enabled":false}' }), env })).status, 401);
  assert.equal((await saveGuestMode({ request:req("/api/admin/guest-mode", { method:"PUT", headers:admin, body:'{"enabled":"false"}' }), env })).status, 400);
  assert.equal((await saveGuestMode({ request:req("/api/admin/guest-mode", { method:"PUT", headers:admin, body:'{"enabled":false}' }), env })).status, 200);
  assert.equal((await (await list({ request:req("/api/articles"), env })).json()).limited, false);
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1"), env })).status, 200);
  await saveGuestMode({ request:req("/api/admin/guest-mode", { method:"PUT", headers:admin, body:'{"enabled":true}' }), env });
  assert.equal((await item({ request:req("/api/articles/item?id=archive-1"), env })).status, 403);
});

test("页面门禁开启时跳转注册页，登录用户和关闭门禁时直接进入", async () => {
  const { env } = fixture();
  const next = async () => new Response("site", { status:200 });
  const redirected = await accessGate({ request:req("/?from=test"), env, next });
  assert.equal(redirected.status, 302);
  assert.equal(new URL(redirected.headers.get("location")).pathname, "/register.html");
  const registered = await register({ request:post("/api/reader/register", { email:"gate@example.com", password:"1234567" }), env });
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  assert.equal((await accessGate({ request:req("/", { headers:{ cookie } }), env, next })).status, 200);
  await saveGuestMode({ request:req("/api/admin/guest-mode", { method:"PUT", headers:{ authorization:"Bearer test-admin", "content-type":"application/json" }, body:'{"enabled":false}' }), env });
  assert.equal((await accessGate({ request:req("/"), env, next })).status, 200);
});

test("004 迁移为旧数据库建立游客模式配置且重复执行不覆盖管理员选择", () => {
  const sqlite = new DatabaseSync(":memory:");
  const migration = readFileSync(new URL("../db/migrations/004-guest-mode.sql", import.meta.url), "utf8");
  sqlite.exec(migration);
  assert.equal(sqlite.prepare("SELECT value FROM site_settings WHERE key='guest_limit_enabled'").get().value, "1");
  sqlite.prepare("UPDATE site_settings SET value='0' WHERE key='guest_limit_enabled'").run();
  sqlite.exec(migration);
  assert.equal(sqlite.prepare("SELECT value FROM site_settings WHERE key='guest_limit_enabled'").get().value, "0");
});

test("运营中心按状态和点击率筛选排序，并按 10 或 20 条分页", async () => {
  const { env, sqlite } = fixture();
  for (let n = 8; n <= 12; n++) {
    sqlite.prepare("INSERT INTO articles (id,source_url,title,author,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(`archive-${n}`, `https://example.org/${n}`, `档案 ${n}`, "writer", "published", `2026-09-${String(n).padStart(2,"0")}`, `2026-09-${String(n).padStart(2,"0")}`);
  }
  sqlite.prepare("UPDATE articles SET status='draft' WHERE id='archive-4'").run();
  const metrics = sqlite.prepare("INSERT INTO article_metrics_daily (article_id,day,impressions,clicks) VALUES (?,?,?,?)");
  metrics.run("archive-1", "2026-09-20", 20, 2);
  metrics.run("archive-2", "2026-09-20", 30, 15);
  metrics.run("archive-3", "2026-09-20", 10, 9);
  const get = async (query) => {
    const response = await operations({ request:req(`/api/admin/operations?${query}`, { headers:{ authorization:"Bearer test-admin" } }), env });
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await get("page=1&page_size=10");
  assert.equal(first.total, 12);
  assert.equal(first.rows.length, 10);
  assert.equal((await get("page=2&page_size=10")).rows.length, 2);
  assert.equal((await get("page=1&page_size=20")).rows.length, 12);
  assert.deepEqual((await get("status=draft")).rows.map((row) => row.id), ["archive-4"]);
  const ranked = await get("sort=highest_ctr&page_size=20");
  assert.deepEqual(ranked.rows.slice(0, 2).map((row) => row.id), ["archive-2", "archive-1"]);
  assert.equal(ranked.rows[0].ctr_percent, 50);
  assert.equal(ranked.rows.find((row) => row.id === "archive-3").ctr_percent, null);
});

test("邮箱登录拒绝错误密码与跨站请求，档案 ID 稳定且运营列表可查", async () => {
  const { env, sqlite } = fixture();
  assert.equal((await register({ request:post("/api/reader/register", { email:"invalid", password:"a long reader password" }), env })).status, 400);
  await register({ request:post("/api/reader/register", { email:"reader2@example.com", password:"a long reader password" }), env });
  assert.equal((await login({ request:post("/api/reader/login", { email:"reader2@example.com", password:"wrong password" }), env })).status, 401);
  assert.equal((await login({ request:req("/api/reader/login", { method:"POST", headers:{ origin:"https://evil.example" }, body:"{}" }), env })).status, 403);
  assert.equal((await login({ request:post("/api/reader/login", { email:"reader2@example.com", password:"a long reader password" }), env })).status, 200);
  assert.deepEqual(sqlite.prepare("SELECT article_id,number FROM archive_ids ORDER BY number").all().map((row) => row.article_id),
    Array.from({ length:7 }, (_, i) => `archive-${i+1}`));
  const response = await operations({ request:req("/api/admin/operations?q=DA1", { headers:{ authorization:"Bearer test-admin" } }), env });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows[0].archive_code, "DA1");
});

test("注册密码至少七位，不限制字符类型或 128 位上限", async () => {
  const { env } = fixture();
  assert.equal((await register({ request:post("/api/reader/register", { email:"short@example.com", password:"123456" }), env })).status, 400);
  assert.equal((await register({ request:post("/api/reader/register", { email:"seven@example.com", password:"1234567" }), env })).status, 201);
  const longPassword = "文".repeat(129);
  assert.equal((await register({ request:post("/api/reader/register", { email:"long@example.com", password:longPassword }), env })).status, 201);
  assert.equal((await login({ request:post("/api/reader/login", { email:"long@example.com", password:longPassword }), env })).status, 200);
});

test("注册用户访问按用户和日期累计，匿名访客保持去重", async () => {
  const { env, sqlite } = fixture();
  const registered = await register({ request:post("/api/reader/register", { email:"visits@example.com", password:"1234567" }), env });
  const readerCookie = registered.headers.get("set-cookie").split(";")[0];
  const first = await trackVisit({ request:req("/api/analytics/visit", { method:"POST", headers:{ cookie:readerCookie } }), env });
  const visitorCookie = first.headers.get("set-cookie").split(";")[0];
  await trackVisit({ request:req("/api/analytics/visit", { method:"POST", headers:{ cookie:`${readerCookie}; ${visitorCookie}` } }), env });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM site_visitors").get().total, 1);
  assert.equal(sqlite.prepare("SELECT visits FROM reader_visits_daily").get().visits, 2);
  const dashboard = await (await overview({ request:req("/api/admin/overview", { headers:{ authorization:"Bearer test-admin" } }), env })).json();
  assert.equal(dashboard.analytics.visitor_summary.total, 1);
  assert.equal(dashboard.analytics.registration_summary.total, 1);
  assert.equal(dashboard.analytics.registrations[0].new_users, 1);
});

test("006 迁移建立邮箱账号、匿名访客和注册用户访问记录表", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE articles(id TEXT PRIMARY KEY,created_at TEXT NOT NULL)");
  sqlite.exec(readFileSync(new URL("../db/migrations/003-reader-archives.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../db/migrations/006-email-accounts-and-visitors.sql", import.meta.url), "utf8"));
  assert.ok(sqlite.prepare("PRAGMA table_info(reader_users)").all().some((column) => column.name === "email"));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM site_visitors").get().total, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM reader_visits_daily").get().total, 0);
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
