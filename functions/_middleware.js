import { reader } from "../lib/readers.js";
import { guestLimitEnabled } from "../lib/site-settings.js";

const PROTECTED_PAGES = new Set(["/", "/index.html", "/article", "/article/", "/article.html"]);

export async function onRequest({ request, env, next }) {
  if (request.method !== "GET") return next();
  const url = new URL(request.url);
  if (!PROTECTED_PAGES.has(url.pathname)) return next();
  try {
    if (!await guestLimitEnabled(env.DB) || await reader(request, env)) return next();
    const destination = `${url.pathname}${url.search}${url.hash}`;
    const login = new URL("/register.html", url.origin);
    login.searchParams.set("next", destination);
    return Response.redirect(login, 302);
  } catch {
    return next();
  }
}
