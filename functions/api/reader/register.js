import { database, json } from "../../../lib/articles.js";
import { normalizeEmail, passwordHash, rateLimit, sameOrigin, startSession } from "../../../lib/readers.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error:"invalid_origin" }, 403);
  const missing = database(env);
  if (missing) return missing;
  try {
    if (!await rateLimit(request, env, "register", 5, 3600)) return json({ error:"too_many_attempts" }, 429);
    const input = await request.json();
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    if (!email) return json({ error:"invalid_email" }, 400);
    if (password.length <= 6) return json({ error:"invalid_password" }, 400);
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO reader_users (id,username,email,password_hash,password_salt) VALUES (?,?,?,?,?)").bind(id, email, email, await passwordHash(password, salt), salt).run();
    const response = json({ email }, 201);
    response.headers.set("set-cookie", await startSession(id, env, request));
    return response;
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) return json({ error:"email_taken" }, 409);
    return json({ error:"registration_unavailable" }, 503);
  }
}
