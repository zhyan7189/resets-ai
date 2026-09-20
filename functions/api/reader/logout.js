import { database, json } from "../../../lib/articles.js";
import { endSession, sameOrigin } from "../../../lib/readers.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error:"invalid_origin" }, 403);
  const missing = database(env);
  if (missing) return missing;
  try {
    const response = json({ ok:true });
    response.headers.set("set-cookie", await endSession(request, env));
    return response;
  } catch { return json({ error:"logout_unavailable" }, 503); }
}
