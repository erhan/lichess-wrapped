import { removedSet, USERNAME_RE } from "./lichess";
import { homePage, loadingPage, messagePage, profilePage, sitemap } from "./render";
import { DICTS, fill, pickLang, type Lang } from "./i18n";
import { esc } from "./format";
import type { Profile, View, Ingest, State } from "./profile";
import type { Registry } from "./registry";

export { Profile } from "./profile";
export { Registry } from "./registry";

export interface Env {
  PROFILE: DurableObjectNamespace<Profile>;
  REGISTRY: DurableObjectNamespace<Registry>;
  ASSETS: Fetcher;
  REMOVED?: string;
}

const MAX_BODY = 8 << 20;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", vary: "accept-language, cookie" } });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const profile = (env: Env, name: string) => env.PROFILE.get(env.PROFILE.idFromName(name.toLowerCase()));

const publicState = (s: State) => ({
  status: s.status, name: s.name, id: s.id, fetched: s.fetched, expected: s.expected,
  cursor: s.cursor, needUser: s.needUser, updatedAt: s.updatedAt,
});

const invalidName = (lang: Lang, name: string) =>
  html(messagePage(lang, DICTS[lang].invalidTitle, DICTS[lang].invalidText, name), 400);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const res = await route(req, env, ctx);
    // ?lang= is remembered so links between pages keep the language.
    const q = new URL(req.url).searchParams.get("lang");
    if ((q === "tr" || q === "en") && res.headers.get("content-type")?.startsWith("text/html")) {
      const out = new Response(res.body, res);
      out.headers.append("set-cookie", `lang=${q}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
      return out;
    }
    return res;
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = decodeURIComponent(url.pathname);
  const { lang } = pickLang(req, url);
  const t = DICTS[lang];
  const removed = removedSet(env.REMOVED);
  const allowed = (name: string) => USERNAME_RE.test(name) && !removed.has(name.toLowerCase());
  let m: RegExpMatchArray | null;

  if (path === "/") {
    const reg = await env.REGISTRY.get(env.REGISTRY.idFromName("main")).home(12);
    return html(homePage(lang, reg));
  }

  if (path === "/sitemap.xml") {
    const all = await env.REGISTRY.get(env.REGISTRY.idFromName("main")).all();
    return new Response(sitemap(all), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }

  if (path === "/go") {
    const u = (url.searchParams.get("u") ?? "").trim().replace(/^https?:\/\/lichess\.org\/@\//, "").replace(/^@/, "");
    if (!USERNAME_RE.test(u)) return invalidName(lang, u);
    return Response.redirect(`${url.origin}/@/${u}`, 302);
  }

  if ((m = path.match(/^\/@\/([^/]+)\/?$/))) {
    const name = m[1];
    if (!USERNAME_RE.test(name)) return invalidName(lang, name);
    if (removed.has(name.toLowerCase())) {
      // Erasing again is harmless and covers anything stored before the account was listed.
      await Promise.all([profile(env, name).erase(), env.REGISTRY.get(env.REGISTRY.idFromName("main")).remove(name.toLowerCase())]);
      return html(messagePage(lang, t.removedTitle, t.removedText), 410);
    }
    const { state, stats } = (await profile(env, name).view(name)) as View;
    if (stats) {
      if (state.name !== name) return Response.redirect(`${url.origin}/@/${state.name}${url.search}`, 301);
      return html(profilePage(lang, stats, state));
    }
    if (state.status === "missing") return html(messagePage(lang, t.missingTitle, fill(t.missingText, { name: esc(name) }), name), 404);
    if (state.status === "closed") return html(messagePage(lang, t.closedTitle, t.closedText, name), 410);
    return html(loadingPage(lang, state));
  }

  if ((m = path.match(/^\/api\/status\/([^/]+)$/)) && allowed(m[1])) {
    const s = await profile(env, m[1]).status();
    return s ? json(publicState(s)) : json({ status: "unknown" }, 404);
  }

  if ((m = path.match(/^\/api\/ingest\/([^/]+)$/)) && allowed(m[1]) && req.method === "POST") {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "too large" }, 413);
    let body: Ingest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (typeof body?.since !== "number") return json({ error: "since required" }, 400);
    const r = await profile(env, m[1]).ingest(body);
    if (!r.ok) return json({ error: r.error, state: r.state && publicState(r.state) }, r.code);
    return json(publicState(r.state));
  }

  if ((m = path.match(/^\/api\/refresh\/([^/]+)$/)) && allowed(m[1]) && req.method === "POST") {
    const s = await profile(env, m[1]).refresh();
    return s ? json(publicState(s)) : json({ status: "unknown" }, 404);
  }

  if ((m = path.match(/^\/api\/stats\/([^/]+)\.json$/)) && allowed(m[1])) {
    const s = await profile(env, m[1]).stats();
    return s ? new Response(JSON.stringify(s), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } })
      : json({ error: "not found" }, 404);
  }

  if ((m = path.match(/^\/og\/([^/]+)\.png$/)) && allowed(m[1])) {
    const cache = caches.default;
    const hit = await cache.match(req);
    if (hit) return hit;
    const png = await profile(env, m[1]).og(url.searchParams.get("lang") === "en" ? "en" : "tr").catch(e => { console.error("og", e); return null; });
    if (!png) return env.ASSETS.fetch(new Request(`${url.origin}/og-default.png`));
    const res = new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    ctx.waitUntil(cache.put(req, res.clone()));
    return res;
  }

  return env.ASSETS.fetch(req);
}
