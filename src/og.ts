import { ImageResponse } from "workers-og";
import { STANDARD_PERFS, type Stats } from "./stats";
import { fmt, pct, esc } from "./format";
import { DICTS, fill, type Lang } from "./i18n";

let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]> | null = null;

// Google Fonts serves plain TTF (full glyph set, Turkish included) to clients it does not recognise.
async function loadFont(weight: 400 | 700) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, { cf: { cacheTtl: 86400, cacheEverything: true } })).text();
  const url = css.match(/src: url\((.+?)\)/)?.[1];
  if (!url) throw new Error("font url not found");
  const data = await (await fetch(url, { cf: { cacheTtl: 86400 * 30, cacheEverything: true } })).arrayBuffer();
  return { name: "Inter", data, weight, style: "normal" as const };
}

function getFonts() {
  fonts ??= Promise.all([loadFont(400), loadFont(700)]).catch(e => { fonts = null; throw e; });
  return fonts;
}

const stat = (v: string, l: string) => `<div style="display:flex;flex-direction:column;padding:22px 26px;background:#1f1913;border:1px solid #33291d;border-radius:18px;flex:1">
<div style="font-size:52px;font-weight:700;color:#f4ecdf">${v}</div><div style="font-size:18px;letter-spacing:3px;color:#a59b88;margin-top:6px">${l}</div></div>`;

export async function renderOg(s: Stats, lang: Lang): Promise<ArrayBuffer> {
  const t = DICTS[lang];
  const f = (n: number) => fmt(n, lang);
  const u = s.user;
  const best = [...s.perfs].filter(p => p.cur && STANDARD_PERFS.includes(p.key)).sort((a, b) => b.n - a.n)[0];
  const html = `<div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:56px 64px;background:#120f0b;background-image:radial-gradient(circle at 90% 0%, rgba(227,181,91,0.28), rgba(18,15,11,0) 55%);font-family:Inter;color:#efe7da">
<div style="display:flex;align-items:center">
<div style="display:flex;width:132px;height:132px;border-radius:66px;background:#e3b55b;align-items:center;justify-content:center;font-size:68px;font-weight:700;color:#1a140b">${esc(u.name[0].toUpperCase())}</div>
<div style="display:flex;flex-direction:column;margin-left:34px">
<div style="font-size:20px;letter-spacing:5px;color:#e3b55b;font-weight:700">${t.eyebrow}</div>
<div style="display:flex;align-items:center;margin-top:8px">${u.title ? `<div style="display:flex;background:#e3b55b;color:#1a140b;font-size:30px;font-weight:700;padding:4px 12px;border-radius:8px;margin-right:16px">${esc(u.title)}</div>` : ""}<div style="font-size:60px;font-weight:700">${esc(u.realName || u.name)}</div></div>
<div style="font-size:24px;color:#b7ad9b;margin-top:6px">lichess.org/@/${esc(u.name)}</div></div></div>
<div style="display:flex;gap:18px;margin-top:52px">
${stat(f(s.all.n), t.kGames)}${stat(f(s.all.W), t.kWins)}${stat(pct(s.all.s, lang, 1), t.ogScore)}${best ? stat(String(best.cur), (t.perf[best.key] ?? best.key).toLocaleUpperCase(lang)) : ""}
</div>
<div style="display:flex;flex-direction:column;margin-top:34px">
<div style="display:flex;height:20px;border-radius:10px;overflow:hidden;background:#2a241b">
<div style="width:${(s.all.W / (s.all.n || 1) * 100).toFixed(2)}%;background:#7fb069"></div><div style="width:${(s.all.D / (s.all.n || 1) * 100).toFixed(2)}%;background:#8d877c"></div><div style="width:${(s.all.L / (s.all.n || 1) * 100).toFixed(2)}%;background:#d8604a"></div></div>
<div style="display:flex;justify-content:space-between;font-size:22px;color:#b7ad9b;margin-top:12px"><div>${f(s.all.W)} ${t.win}</div><div>${f(s.all.D)} ${t.draw}</div><div>${f(s.all.L)} ${t.loss}</div></div></div>
<div style="display:flex;margin-top:auto;justify-content:space-between;font-size:22px;color:#8d8472">
<div style="display:flex">${fill(t.ogMoves, { m: f(s.moves.own), o: f(s.distinctOpponents), s: s.streaks.win })}</div><div style="display:flex;color:#e3b55b;font-weight:700">lichess.erhan.dev</div></div>
</div>`;
  // workers-og splits text into several nodes, and satori requires flex on any div with more than one child.
  const res = new ImageResponse(html.replace(/>\s+</g, "><").replace(/<div style="(?!display:flex)/g, '<div style="display:flex;').replace(/<div>/g, '<div style="display:flex">'), { width: 1200, height: 630, format: "png", fonts: await getFonts() });
  if (!res.ok) throw new Error(`og render ${res.status}`);
  return res.arrayBuffer();
}
