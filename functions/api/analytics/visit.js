import { database, json } from "../../../lib/articles.js";
import { reader, visitorIdentity } from "../../../lib/readers.js";

export async function onRequestPost({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const [visitor, user] = await Promise.all([visitorIdentity(request), reader(request, env)]);
    await env.DB.prepare(`INSERT INTO site_visits_daily (day,pageviews) VALUES (date('now'),1)
      ON CONFLICT(day) DO UPDATE SET pageviews=pageviews+1`).run();
    await env.DB.prepare(`INSERT INTO site_visitors (visitor_hash,first_seen_day,last_seen_at,pageviews,reader_user_id)
      VALUES (?,date('now'),CURRENT_TIMESTAMP,1,?)
      ON CONFLICT(visitor_hash) DO UPDATE SET last_seen_at=CURRENT_TIMESTAMP,pageviews=pageviews+1,
      reader_user_id=COALESCE(excluded.reader_user_id,site_visitors.reader_user_id)`).bind(visitor.hash, user?.id || null).run();
    await env.DB.prepare(`INSERT INTO site_visitor_days (visitor_hash,day,pageviews) VALUES (?,date('now'),1)
      ON CONFLICT(visitor_hash,day) DO UPDATE SET pageviews=pageviews+1`).bind(visitor.hash).run();
    if (user) await env.DB.prepare(`INSERT INTO reader_visits_daily (user_id,day,visits,last_seen_at) VALUES (?,date('now'),1,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,day) DO UPDATE SET visits=visits+1,last_seen_at=CURRENT_TIMESTAMP`).bind(user.id).run();
    const response = json({ ok:true });
    if (visitor.isNew) response.headers.set("set-cookie", visitor.cookie);
    return response;
  } catch { return json({ error:"analytics_unavailable" }, 503); }
}
