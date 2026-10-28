import { USERNAME_RE } from "./lichess";
import { homePage, loadingPage, messagePage, profilePage } from "./render";
import type { Profile, View, Ingest, State } from "./profile";
import type { Registry } from "./registry";

export { Profile } from "./profile";
export { Registry } from "./registry";

export interface Env {
  PROFILE: DurableObjectNamespace<Profile>;
  REGISTRY: DurableObjectNamespace<Registry>;
  ASSETS: Fetcher;
}

const MAX_BODY = 8 << 20;

const html = (body: string, status = 200, cache = "no-store") =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const profile = (env: Env, name: string) => env.PROFILE.get(env.PROFILE.idFromName(name.toLowerCase()));

const publicState = (s: State) => ({
  status: s.status, name: s.name, id: s.id, fetched: s.fetched, expected: s.expected,
  cursor: s.cursor, needUser: s.needUser, updatedAt: s.updatedAt,
});

const invalidName = (name: string) =>
  html(messagePage("Geçersiz kullanıcı adı", "Lichess kullanıcı adları harf, rakam, alt çizgi ve tire içerir.", name), 400);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname);
    let m: RegExpMatchArray | null;

    if (path === "/") {
      const reg = await env.REGISTRY.get(env.REGISTRY.idFromName("main")).recent(12);
      return html(homePage(reg), 200, "public, max-age=60");
    }

    if (path === "/go") {
      const u = (url.searchParams.get("u") ?? "").trim().replace(/^https?:\/\/lichess\.org\/@\//, "").replace(/^@/, "");
      if (!USERNAME_RE.test(u)) return invalidName(u);
      return Response.redirect(`${url.origin}/@/${u}`, 302);
    }

    if ((m = path.match(/^\/@\/([^/]+)\/?$/))) {
      const name = m[1];
      if (!USERNAME_RE.test(name)) return invalidName(name);
      const { state, stats } = (await profile(env, name).view(name)) as View;
      if (stats) {
        if (state.name !== name) return Response.redirect(`${url.origin}/@/${state.name}`, 301);
        return html(profilePage(stats, state));
      }
      if (state.status === "missing") return html(messagePage("Kullanıcı bulunamadı", `Lichess'te <b>${name}</b> adında bir hesap yok.`, name), 404);
      if (state.status === "closed") return html(messagePage("Hesap kapalı", "Bu Lichess hesabı kapatılmış veya kural ihlali nedeniyle işaretlenmiş.", name), 410);
      return html(loadingPage(state));
    }

    if ((m = path.match(/^\/api\/status\/([^/]+)$/)) && USERNAME_RE.test(m[1])) {
      const s = await profile(env, m[1]).status();
      return s ? json(publicState(s)) : json({ status: "unknown" }, 404);
    }

    if ((m = path.match(/^\/api\/ingest\/([^/]+)$/)) && USERNAME_RE.test(m[1]) && req.method === "POST") {
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

    if ((m = path.match(/^\/api\/refresh\/([^/]+)$/)) && USERNAME_RE.test(m[1]) && req.method === "POST") {
      const s = await profile(env, m[1]).refresh();
      return s ? json(publicState(s)) : json({ status: "unknown" }, 404);
    }

    if ((m = path.match(/^\/api\/stats\/([^/]+)\.json$/)) && USERNAME_RE.test(m[1])) {
      const s = await profile(env, m[1]).stats();
      return s ? new Response(JSON.stringify(s), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } })
        : json({ error: "not found" }, 404);
    }

    if ((m = path.match(/^\/og\/([^/]+)\.png$/)) && USERNAME_RE.test(m[1])) {
      const cache = caches.default;
      const hit = await cache.match(req);
      if (hit) return hit;
      const png = await profile(env, m[1]).og().catch(e => { console.error("og", e); return null; });
      if (!png) return env.ASSETS.fetch(new Request(`${url.origin}/og-default.png`));
      const res = new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
      ctx.waitUntil(cache.put(req, res.clone()));
      return res;
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
