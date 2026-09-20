import { database, json } from "../../../lib/articles.js";
import { passwordHash, rateLimit, sameOrigin, startSession } from "../../../lib/readers.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error:"invalid_origin" }, 403);
  const missing = database(env);
  if (missing) return missing;
  try {
    if (!await rateLimit(request, env, "register", 5, 3600)) return json({ error:"too_many_attempts" }, 429);
    const input = await request.json();
    const username = String(input.username || "").trim();
    const password = String(input.password || "");
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username) || username.toLowerCase() === "admin") return json({ error:"invalid_username" }, 400);
    if (password.length <= 6) return json({ error:"invalid_password" }, 400);
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO reader_users (id,username,password_hash,password_salt) VALUES (?,?,?,?)").bind(id, username, await passwordHash(password, salt), salt).run();
    const response = json({ username }, 201);
    response.headers.set("set-cookie", await startSession(id, env, request));
    return response;
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) return json({ error:"username_taken" }, 409);
    return json({ error:"registration_unavailable" }, 503);
  }
}
