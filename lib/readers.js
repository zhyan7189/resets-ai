import { json } from "./articles.js";

const encoder = new TextEncoder();
const COOKIE = "resets_reader";
const VISITOR_COOKIE = "resets_visitor";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const randomHex = (size) => hex(crypto.getRandomValues(new Uint8Array(size)));
const sha256 = async (value) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const cookieValue = (request, name) => request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const secureCookie = (request) => new URL(request.url).protocol === "https:" ? "; Secure" : "";

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:new Uint8Array(salt.match(/../g).map((part) => parseInt(part, 16))), iterations:100000 }, key, 256));
}

export function sameHash(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export async function reader(request, env) {
  const token = cookieValue(request, COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
  const digest = await sha256(token);
  return env.DB.prepare("SELECT u.id, u.email FROM reader_sessions s JOIN reader_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')").bind(digest).first();
}

export async function startSession(userId, env, request) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO reader_sessions (token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))").bind(await sha256(token), userId).run();
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secureCookie(request)}`;
}

export async function endSession(request, env) {
  const token = cookieValue(request, COOKIE);
  if (/^[a-f0-9]{64}$/.test(token || "")) await env.DB.prepare("DELETE FROM reader_sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie(request)}`;
}

export async function visitorIdentity(request) {
  const existing = cookieValue(request, VISITOR_COOKIE);
  const token = /^[a-f0-9]{64}$/.test(existing) ? existing : randomHex(32);
  return {
    hash:await sha256(token),
    isNew:token !== existing,
    cookie:`${VISITOR_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${2 * 365 * 24 * 60 * 60}${secureCookie(request)}`,
  };
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return origin && origin === new URL(request.url).origin;
}

export async function rateLimit(request, env, kind, max, windowSeconds) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const key = await sha256(`${kind}:${ip}`);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`INSERT INTO reader_attempts (attempt_key,attempts,window_start) VALUES (?,1,?)
    ON CONFLICT(attempt_key) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END,
    window_start=CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END
    RETURNING attempts`).bind(key, now, now-windowSeconds, now-windowSeconds).first();
  return row.attempts <= max;
}

export const readerError = (code, status) => json({ error:code }, status);
