import { database, json } from "../../../lib/articles.js";
import { reader } from "../../../lib/readers.js";

export async function onRequestGet({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const user = await reader(request, env);
    return json({ logged_in:!!user, username:user?.username || null });
  } catch { return json({ error:"session_unavailable" }, 503); }
}
