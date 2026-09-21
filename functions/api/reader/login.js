import { database, json } from "../../../lib/articles.js";
import { normalizeEmail, passwordHash, rateLimit, sameHash, sameOrigin, startSession } from "../../../lib/readers.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error:"invalid_origin" }, 403);
  const missing = database(env);
  if (missing) return missing;
  try {
    if (!await rateLimit(request, env, "login", 12, 900)) return json({ error:"too_many_attempts" }, 429);
    const input = await request.json();
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    if (!email) return json({ error:"invalid_credentials" }, 401);
    const user = await env.DB.prepare("SELECT id,email,password_hash,password_salt FROM reader_users WHERE email=? COLLATE NOCASE").bind(email).first();
    if (!user || !sameHash(await passwordHash(password, user.password_salt), user.password_hash)) return json({ error:"invalid_credentials" }, 401);
    const response = json({ email:user.email });
    response.headers.set("set-cookie", await startSession(user.id, env, request));
    return response;
  } catch { return json({ error:"login_unavailable" }, 503); }
}
