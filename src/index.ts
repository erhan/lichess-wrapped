import { USERNAME_RE } from "./lichess";
import { homePage, loadingPage, messagePage, profilePage } from "./render";
import type { Profile, View } from "./profile";
import type { Registry } from "./registry";

export { Profile } from "./profile";
export { Registry } from "./registry";

export interface Env {
  PROFILE: DurableObjectNamespace<Profile>;
  REGISTRY: DurableObjectNamespace<Registry>;
  ASSETS: Fetcher;
}

const html = (body: string, status = 200, cache = "no-store") =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const profile = (env: Env, name: string) => env.PROFILE.get(env.PROFILE.idFromName(name.toLowerCase()));

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
      const u = (url.searchParams.get("u") ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/lichess\.org\/@\//, "");
      if (!USERNAME_RE.test(u)) return html(messagePage("Geçersiz kullanıcı adı", "Lichess kullanıcı adları harf, rakam, alt çizgi ve tire içerir.", u), 400);
      return Response.redirect(`${url.origin}/@/${u}`, 302);
    }

    if ((m = path.match(/^\/@\/([^/]+)\/?$/))) {
      const name = m[1];
      if (!USERNAME_RE.test(name)) return html(messagePage("Geçersiz kullanıcı adı", "Lichess kullanıcı adları harf, rakam, alt çizgi ve tire içerir.", name), 400);
      const { state, stats } = (await profile(env, name).view(name)) as View;
      if (stats) {
        if (state.name !== name) return Response.redirect(`${url.origin}/@/${state.name}`, 301);
        return html(profilePage(stats, state));
      }
      if (state.status === "missing") return html(messagePage("Kullanıcı bulunamadı", `Lichess'te <b>${name.replace(/[<>&"]/g, "")}</b> adında bir hesap yok.`, name), 404);
      if (state.status === "closed") return html(messagePage("Hesap kapalı", "Bu Lichess hesabı kapatılmış veya kural ihlali nedeniyle işaretlenmiş.", name), 410);
      if (state.status === "error") return html(messagePage("Bir sorun oluştu", "Lichess'e şu an ulaşılamıyor. Birazdan tekrar dene.", name), 503);
      return html(loadingPage(state));
    }

    if ((m = path.match(/^\/api\/status\/([^/]+)$/)) && USERNAME_RE.test(m[1])) {
      const s = await profile(env, m[1]).status();
      return s ? json({ status: s.status, name: s.name, fetched: s.fetched, expected: s.expected, waitUntil: s.waitUntil ?? null, updatedAt: s.updatedAt })
        : json({ status: "unknown" }, 404);
    }

    if ((m = path.match(/^\/api\/refresh\/([^/]+)$/)) && USERNAME_RE.test(m[1]) && req.method === "POST") {
      const s = await profile(env, m[1]).refresh().catch(() => null);
      return s ? json({ status: s.status, fetched: s.fetched, expected: s.expected }) : json({ status: "unknown" }, 404);
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
      const png = await profile(env, m[1]).og();
      if (!png) return env.ASSETS.fetch(new Request(`${url.origin}/og-default.png`));
      const res = new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
      ctx.waitUntil(cache.put(req, res.clone()));
      return res;
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
