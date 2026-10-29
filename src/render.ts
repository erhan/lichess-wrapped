import type { Stats, Rec, Named } from "./stats";
import type { State } from "./profile";
import type { Home } from "./registry";
import { MIN_ACC_GAMES, type Community, type Row } from "./community";
import { DICTS, LANGS, fill, type Lang, type Dict } from "./i18n";
import { fmt, dec, pct, date, month, esc, flag, PIECE_GLYPHS } from "./format";

const ORIGIN = "https://lichess.erhan.dev";
const ASSET_V = 12;

interface Layout {
  lang: Lang; title: string; desc: string; path: string; image?: string; body: string; cls?: string;
  noindex?: boolean; search?: boolean; type?: "website" | "profile"; jsonld?: object;
}

// Each language has its own URL (?lang=), the bare path is the x-default.
const pageUrl = (path: string, lang: Lang) => `${ORIGIN}${path}?lang=${lang}`;

// Applies the saved theme before first paint; without one the CSS follows the system setting.
const THEME_BOOT = `<script>try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>`;

const SUN = `<svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>`;
const MOON = `<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>`;

function layout(p: Layout) {
  const t = DICTS[p.lang];
  const image = p.image ?? `${ORIGIN}/og-default.png`;
  const url = pageUrl(p.path, p.lang);
  const client = JSON.stringify({ lang: p.lang, ...t.client }).replace(/</g, "\\u003c");
  const langLinks = LANGS.map(l => `<a href="?lang=${l}" hreflang="${l}"${l === p.lang ? ' aria-current="true"' : ""}>${l.toUpperCase()}</a>`).join("");
  return `<!doctype html><html lang="${p.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${THEME_BOOT}
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
${LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${pageUrl(p.path, l)}">`).join("")}<link rel="alternate" hreflang="x-default" href="${ORIGIN}${p.path}">
<meta property="og:type" content="${p.type ?? "website"}"><meta property="og:site_name" content="${t.site}">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(p.title)}">
<meta property="og:locale" content="${p.lang === "tr" ? "tr_TR" : "en_US"}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">
${p.noindex ? '<meta name="robots" content="noindex">' : ""}
<meta name="theme-color" content="#14110d" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#f6f2ea" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/inter-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
<script id="i18n" type="application/json">${client}</script>
${p.jsonld ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...p.jsonld }).replace(/</g, "\\u003c")}</script>` : ""}
<script src="/app.js?v=${ASSET_V}" defer></script>
</head><body class="${p.cls ?? ""}">
<nav class="nav"><div class="nav-in">
<a class="brand" href="/"><span class="brand-k">♞</span><span>${t.site}</span></a>
${p.search ? searchForm(t) : "<span></span>"}
<div class="tools"><div class="seg" role="group" aria-label="${t.language}">${langLinks}</div>
<button class="icon-btn" data-theme-toggle type="button" aria-label="${t.theme}" title="${t.theme}">${SUN}${MOON}</button></div>
</div></nav>
${p.body}</body></html>`;
}

function searchForm(t: Dict, value = "", big = false) {
  return `<form class="search${big ? " big" : ""}" action="/go" method="get" role="search">
<span class="s-ico" aria-hidden="true">♞</span><input name="u" value="${esc(value)}" placeholder="${t.searchPlaceholder}" aria-label="${t.searchPlaceholder}" autocomplete="off" autocapitalize="off" spellcheck="false" required pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{1,29}"${big ? " autofocus" : ""}>
<button type="submit">${t.analyze}</button></form>`;
}

// Profile pictures for a few accounts (Lichess has none), keyed by lowercase id.
const AVATARS: Record<string, string> = {
  seyyah1061: "https://images.chesscomfiles.com/uploads/v1/user/2711034.ff8b4a66.200x200o.f55cc5f00e64.jpg",
};
const initial = (name: string) => {
  const src = AVATARS[name.toLowerCase()];
  return src ? `<img src="${src}" alt="" crossorigin="anonymous">` : esc(name[0].toUpperCase());
};

const titleTag = (t?: string | null) => t ? `<span class="tag">${esc(t)}</span>` : "";
const GITHUB = "https://github.com/erhan/lichess-wrapped";
const GH_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;
const footer = (left: string, right = "lichess.erhan.dev") =>
  `<footer class="foot"><span>${left}</span><span class="foot-r"><span>${right}</span><a class="gh" href="${GITHUB}" target="_blank" rel="noopener">${GH_ICON}GitHub</a></span></footer>`;

export function homePage(lang: Lang, reg: Home) {
  const t = DICTS[lang];
  const cards = reg.recent.map(e => `<a class="pcard" href="/@/${esc(e.name)}">
<span class="mono">${initial(e.name)}</span>
<span class="pc-n">${titleTag(e.title)}<b>${esc(e.name)}</b> ${flag(e.flag)}</span>
<span class="pc-s">${fill(t.nGames, { n: fmt(e.games, lang) })} · ${pct(e.score, lang)}${e.blitz ? ` · blitz ${e.blitz}` : ""}</span></a>`).join("");
  const examples = reg.recent.slice(0, 3).map(e => `<a href="/@/${esc(e.name)}">${esc(e.name)}</a>`).join("");
  const steps = [[t.how1t, t.how1d], [t.how2t, t.how2d], [t.how3t, t.how3d]]
    .map(([h, d], i) => `<div class="step"><span class="step-n">${i + 1}</span><h3>${h}</h3><p>${d}</p></div>`).join("");
  return layout({
    lang, title: t.homeTitle, desc: t.homeDesc, path: "/", cls: "home",
    jsonld: {
      "@type": "WebSite", name: t.site, url: `${ORIGIN}/`, description: t.homeDesc, inLanguage: lang,
      potentialAction: { "@type": "SearchAction", target: `${ORIGIN}/go?u={u}`, "query-input": "required name=u" },
    },
    body: `<main class="wrap">
<section class="hero-home"><div class="board" aria-hidden="true"></div>
<h1 class="home-h">${t.homeH1a} <em>${t.homeH1b}</em></h1>
<p class="lead">${t.homeLead}</p>
${searchForm(t, "", true)}
${examples ? `<div class="examples">${examples}</div>` : ""}
</section>
<section class="how"><h2 class="sec">${t.howTitle}</h2><div class="steps">${steps}</div></section>
${reg.community ? communitySection(lang, reg.community) : ""}
${reg.recent.length ? `<section><h2 class="sec">${t.recent} <span class="muted">${fill(t.profilesCount, { n: fmt(reg.total, lang) })}</span></h2><div class="pgrid">${cards}</div></section>` : ""}
${footer(t.dataFrom)}</main>`,
  });
}

export function messagePage(lang: Lang, title: string, text: string, value = "") {
  const t = DICTS[lang];
  return layout({
    lang, title: `${title} — ${t.site}`, desc: text, path: "/", cls: "home", noindex: true,
    body: `<main class="wrap narrow"><section class="hero-home small"><h1 class="home-h">${esc(title)}</h1><p class="lead">${text}</p>${searchForm(t, value, true)}</section></main>`,
  });
}

export function loadingPage(lang: Lang, state: State) {
  const t = DICTS[lang];
  const done = state.expected ? Math.min(99, Math.round(state.fetched / state.expected * 100)) : 0;
  return layout({
    lang, title: `${fill(t.loadingTitle, { name: state.name })} — ${t.site}`, desc: fill(t.loadingDesc, { name: state.name }),
    path: `/@/${state.name}`, cls: "home", noindex: true, search: true,
    body: `<main class="wrap narrow"><section class="hero-home small loading" data-import="${esc(state.id)}">
<div class="spin" aria-hidden="true">♞</div>
<h1 class="home-h">${esc(state.name)}</h1>
<p class="lead">${t.loadingLead}</p>
<noscript><p class="lead">${t.noscript}</p></noscript>
<div class="bar"><i style="width:${done}%"></i></div>
<p class="prog"><b data-fetched>${fmt(state.fetched, lang)}</b> / <span data-expected>${fmt(state.expected, lang)}</span> ${t.games} <span class="muted" data-note></span></p>
</section></main>`,
  });
}

// ---------- profile ----------

function wdl(r: Rec, t: Dict, h = 10) {
  const n = r.n || 1;
  return `<div class="wdl" style="height:${h}px" title="${fill(t.wdlShort, { w: r.W, d: r.D, l: r.L })}"><i class="bw" style="width:${(r.W / n * 100).toFixed(2)}%"></i><i class="bd" style="width:${(r.D / n * 100).toFixed(2)}%"></i><i class="bl" style="width:${(r.L / n * 100).toFixed(2)}%"></i></div>`;
}

function donut(r: Rec, lang: Lang) {
  const S = 230, R = S / 2 - 14, cx = S / 2;
  let a0 = -Math.PI / 2;
  const tot = r.n || 1;
  const arcs = ([[r.W, "w"], [r.D, "d"], [r.L, "l"]] as [number, string][]).filter(([v]) => v > 0).map(([v, cls]) => {
    const a1 = a0 + v / tot * 2 * Math.PI;
    const end = v === tot ? a1 - 0.0001 : a1 - 0.012;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M${(cx + R * Math.cos(a0)).toFixed(1)},${(cx + R * Math.sin(a0)).toFixed(1)} A${R},${R} 0 ${large} 1 ${(cx + R * Math.cos(end)).toFixed(1)},${(cx + R * Math.sin(end)).toFixed(1)}`;
    a0 = a1;
    return `<path class="s${cls}" d="${d}" stroke-width="26" fill="none"/>`;
  }).join("");
  return `<svg class="donut" viewBox="0 0 ${S} ${S}">${arcs}<text x="${cx}" y="${cx - 2}" text-anchor="middle" class="d-big">${pct(r.s, lang, 1)}</text><text x="${cx}" y="${cx + 26}" text-anchor="middle" class="d-sub">${DICTS[lang].scoreRate}</text></svg>`;
}

function yearChart(years: Stats["years"], lang: Lang) {
  const W = 570, H = 230;
  const mx = Math.max(1, ...years.map(y => y.n));
  const bw = (W - 40) / Math.max(1, years.length);
  const out: string[] = [];
  years.forEach((y, i) => {
    const x = 20 + i * bw, bh = y.n / mx * (H - 70), top = H - 30 - bh;
    let seg = top;
    for (const [v, cls] of [[y.W, "w"], [y.D, "d"], [y.L, "l"]] as [number, string][]) {
      const sh = v / Math.max(1, y.n) * bh;
      out.push(`<rect class="f${cls}" x="${(x + bw * .18).toFixed(1)}" y="${seg.toFixed(1)}" width="${(bw * .64).toFixed(1)}" height="${sh.toFixed(1)}"/>`);
      seg += sh;
    }
    out.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(top - 8).toFixed(1)}" text-anchor="middle" class="ax-v">${fmt(y.n, lang)}</text>`);
    out.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="ax">’${String(y.year).slice(2)}</text>`);
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`;
}

function openingList(list: Named[], lang: Lang) {
  const t = DICTS[lang];
  const mx = Math.max(...list.map(o => o.n));
  return list.map(o => `<div class="op"><div class="opn" title="${esc(o.name)}">${esc(o.name)}</div><div class="opb"><div style="width:${(o.n / mx * 100).toFixed(1)}%">${wdl(o, t, 8)}</div></div><div class="num">${fmt(o.n, lang)}</div><div class="num s">${pct(o.s, lang)}</div></div>`).join("");
}

function results(r: { all: Rec; white: Rec; black: Rec }, lang: Lang, extra = "") {
  const t = DICTS[lang];
  const f = (n: number) => fmt(n, lang);
  return `<div class="res">${donut(r.all, lang)}<div class="rb">
<div class="big3"><div class="cw"><b class="num">${f(r.all.W)}</b><span>${t.win}</span></div><div class="cd"><b class="num">${f(r.all.D)}</b><span>${t.draw}</span></div><div class="cl"><b class="num">${f(r.all.L)}</b><span>${t.loss}</span></div></div>
<div class="colrow"><span>♔ ${t.white}</span>${wdl(r.white, t)}<span class="num s">${pct(r.white.s, lang, 1)}</span></div>
<div class="colrow"><span>♚ ${t.black}</span>${wdl(r.black, t)}<span class="num s">${pct(r.black.s, lang, 1)}</span></div>
${extra}</div></div>`;
}

function board(title: string, rows: Row[], value: (r: Row) => string, sub?: (r: Row) => string, note = "") {
  const list = rows.map((r, i) => `<div class="lb"><span class="lb-n">${i + 1}</span><span class="lb-p"><a href="/@/${esc(r.name)}">${titleTag(r.title)}<b>${esc(r.name)}</b></a>${sub ? `<small class="muted">${sub(r)}</small>` : ""}</span><span class="num gold">${value(r)}</span></div>`).join("");
  return card(title, (list || `<p class="muted">–</p>`) + (note ? `<div class="muted note">${note}</div>` : ""));
}

function communitySection(lang: Lang, c: Community) {
  const t = DICTS[lang];
  const f = (n: number) => fmt(n, lang);
  const b = c.boards;
  return `<section class="community"><h2 class="sec">${t.community} <span class="muted">${fill(t.communitySub, { n: f(c.profiles) })}</span></h2>
<div class="kpis">
${kpi(f(c.profiles), t.cProfiles, t.cProfilesSub)}
${kpi(f(c.all.n), t.kGames, "")}
${kpi(f(c.all.W), t.kWins, pct(c.all.n ? c.all.W / c.all.n * 100 : 0, lang, 1), "win")}
${kpi(f(c.own), t.cMoves, t.cMovesSub)}
${kpi(f(c.hours), t.kHours, fill(t.kHoursSub, { n: f(c.hours / 24) }))}
${kpi(f(c.mate), t.cMates, t.cMatesSub)}
</div>
<div class="grid g2">
${card(t.results, results(c, lang))}
${card(t.cWhen, `<div class="parts" data-blocks="${c.blocks.join(",")}"></div>`, ` <span class="muted lc" data-tzlabel></span>`)}
</div>
<div class="grid">${card(t.cOpenings, openingList(c.openings, lang) + `<div class="muted note">${t.cOpeningsNote}</div>`)}</div>
<div class="grid g3">
${board(t.lbGames, b.games, r => f(r.value))}
${board(t.lbRating, b.rating, r => String(r.value), r => t.perf[r.note!] ?? esc(r.note))}
${board(t.lbStreak, b.streak, r => fill(t.lbStreakUnit, { n: r.value }))}
${board(t.lbHours, b.hours, r => fill(t.lbHoursUnit, { n: f(r.value) }))}
${board(t.lbAcc, b.acc, r => pct(r.value, lang, 1), r => fill(t.lbAccNote, { n: f(Number(r.note)) }), fill(t.lbAccMin, { n: MIN_ACC_GAMES }))}
${board(t.lbScalp, b.scalp, r => String(r.value), r => `${r.title2 ? `${esc(r.title2)} ` : ""}<a href="https://lichess.org/${esc(r.link)}" target="_blank" rel="noopener">${esc(r.note)}</a>`)}
</div></section>`;
}

const MAIN_PERFS = ["bullet", "blitz", "rapid", "classical"];

const kpi = (v: string, label: string, sub = "", accent = "gold") => `<div class="kpi k-${accent}"><div class="kv">${v}</div><div class="kl">${label}</div>${sub ? `<div class="ks">${sub}</div>` : ""}</div>`;
const card = (title: string, inner: string, extra = "") => `<section class="card"><h2>${title}${extra}</h2>${inner}</section>`;

export function profilePage(lang: Lang, st: Stats, state: State) {
  const t = DICTS[lang];
  const f = (n: number) => fmt(n, lang);
  const p = (n: number, d = 0) => pct(n, lang, d);
  const u = st.user;
  const name = u.name;
  const fullTitle = `${u.title ? u.title + " " : ""}${u.realName || name}`;
  const desc = fill(t.statsDesc, { games: f(st.all.n), wins: f(st.all.W), score: p(st.all.s, 1), moves: f(st.moves.own), name });
  const ms = st.moves;
  const pieceTot = Object.values(ms.pieces).reduce((a, b) => a + b, 0) || 1;
  const pieceMax = Math.max(1, ...Object.values(ms.pieces));
  const hours = Math.round(u.playTime / 3600);
  const sub = [u.location && esc(u.location), `<a href="https://lichess.org/@/${esc(name)}" target="_blank" rel="noopener">lichess.org/@/${esc(name)}</a>`].filter(Boolean).join(" · ");
  const none = `<p class="muted">${t.noData}</p>`;
  const gameLink = (id: string, text: string) => `<a href="https://lichess.org/${esc(id)}" target="_blank" rel="noopener">${text}</a>`;
  const moveList = (l: [string, number][], prefix: string) => l.slice(0, 4).map(([m, v]) => `<b>${prefix}${esc(m)}</b> ${p(v)}`).join(" · ");

  const openingRows = (list: Named[]) => list.length ? openingList(list, lang) : none;
  const endRows = (list: [string, number][], cls: string) => list.filter(([, v]) => v >= 0.5)
    .map(([k, v]) => `<div class="tr"><span>${t.end[k] ?? esc(k)}</span><div class="tb"><i class="b${cls}" style="width:${v}%"></i></div><b>${p(v)}</b></div>`).join("");
  const perfRows = st.perfs.filter(r => r.n >= 3).map(r => `<tr><td class="pn">${t.perf[r.key] ?? esc(r.key)}</td><td class="num">${f(r.n)}</td><td class="barc">${wdl(r, t)}</td><td class="num s">${p(r.s)}</td><td class="num">${r.cur ?? "–"}</td><td class="num gold">${r.peak ?? "–"}</td></tr>`).join("");

  const body = `<main class="wrap" id="card">
<header class="hero">
<div class="who"><div class="ph"><span>${initial(name)}</span></div><div class="who-t">
<div class="eyebrow">${t.eyebrow}</div>
<h1>${titleTag(u.title)}${esc(u.realName || name)} <span class="fl">${flag(u.flag)}</span></h1>
<div class="hsub">${u.realName ? `<b>${esc(name)}</b> · ` : ""}${sub}</div>
<div class="hdates">${t.member} <b>${date(u.createdAt, lang)}</b> · ${t.updated} <b>${date(state.updatedAt, lang)}</b></div></div></div>
<dl class="hr">${MAIN_PERFS.map(k => {
  const p = u.perfs[k];
  const value = p?.rating && p.games ? p.rating + (p.prov ? `<i title="${t.provisional}">?</i>` : "") : "–";
  return `<div><dt>${t.perf[k]}</dt><dd>${value}</dd></div>`;
}).join("")}</dl>
</header>

<div class="share" data-name="${esc(name)}" data-id="${esc(u.id)}" data-fetched="${state.fetched}"${state.status === "importing" ? ' data-importing="1"' : ""} data-title="${esc(fill(t.statsTitle, { name: fullTitle }))}">
<button data-act="share" class="primary">${t.share}</button><button data-act="copy">${t.copyLink}</button>
<a data-act="wa" target="_blank" rel="noopener">WhatsApp</a><a data-act="x" target="_blank" rel="noopener">X</a>
<button data-act="png">${t.downloadImage}</button>
<span class="toast" role="status"></span></div>

<div class="kpis">
${kpi(f(st.all.n), t.kGames, fill(t.kGamesSub, { n: f(st.rated.n) }))}
${kpi(f(st.all.W), t.kWins, p(st.all.n ? st.all.W / st.all.n * 100 : 0, 1), "win")}
${kpi(f(ms.own), t.kMoves, fill(t.kMovesSub, { n: f(ms.plies) }))}
${kpi(f(hours), t.kHours, fill(t.kHoursSub, { n: f(hours / 24) }))}
${kpi(f(st.distinctOpponents), t.kOpp, fill(t.kOppSub, { g: f(st.tournaments.games), t: f(st.tournaments.arenas + st.tournaments.swiss) }))}
${kpi(st.accuracy ? p(st.accuracy.avg, 1) : "–", t.kAcc, st.accuracy ? fill(t.kAccSub, { n: f(st.accuracy.n) }) : t.kAccNone)}
</div>

<div class="grid g-res">
${card(t.results, results(st, lang, `<div class="colrow"><span>${t.rated}</span>${wdl(st.rated, t)}<span class="num s">${p(st.rated.s, 1)}</span></div>
<div class="muted note">${fill(t.colorNote, { w: f(st.white.n), b: f(st.black.n), c: f(st.casual.n) })}</div>`))}
${card(t.byTempo, `<div class="tscroll"><table><tr><th>${t.thTempo}</th><th>${t.thGames}</th><th class="barh">${t.thWdl}</th><th>${t.thScore}</th><th>${t.thNow}</th><th>${t.thPeak}</th></tr>${perfRows}</table></div>
<div class="legend"><span class="cw">${t.winC}</span><span class="cd">${t.drawC}</span><span class="cl">${t.lossC}</span></div>`)}
</div>

<div class="grid g2">
${card(t.byYear, yearChart(st.years, lang))}
${card(t.when, `<div class="parts" data-blocks="${st.blocks.join(",")}"></div>
<div class="muted note">${fill(t.activeDays, { n: f(st.activeDays) })}${st.busiestMonth ? fill(t.busiestMonth, { m: month(st.busiestMonth.month, lang) }) : ""}</div>`, ` <span class="muted lc" data-tzlabel></span>`)}
</div>

<div class="grid g2">
${card(t.opW, openingRows(st.openings.white) + (st.firstMove.length ? `<div class="muted note">${t.firstMove}: ${moveList(st.firstMove, "1.")}</div>` : ""))}
${card(t.opB, openingRows(st.openings.black) + (st.vsE4.length || st.vsD4.length ? `<div class="muted note">${st.vsE4.length ? `${t.vsE4}: ${moveList(st.vsE4, "1…")}` : ""}${st.vsE4.length && st.vsD4.length ? "<br>" : ""}${st.vsD4.length ? `${t.vsD4}: ${moveList(st.vsD4, "1…")}` : ""}</div>` : ""))}
</div>

<div class="grid g3">
${card(t.moveProfile, `<div class="pieces">${PIECE_GLYPHS.map(([k, g]) => `<div class="pcol"><div class="pbar"><i style="height:${((ms.pieces[k] ?? 0) / pieceMax * 100).toFixed(1)}%"></i></div><div class="pg">${g}</div><div class="pl">${t.pieces[k]}</div><div class="pp">${p((ms.pieces[k] ?? 0) / pieceTot * 100)}</div></div>`).join("")}</div>
<div class="mini"><div><b class="num">${f(ms.cap)}</b><span>${t.captures}</span></div><div><b class="num">${f(ms.chk)}</b><span>${t.checks}</span></div><div><b class="num">${f(ms.mate)}</b><span>${t.mates}</span></div>
<div><b class="num">${f(ms.short)}</b><span>${t.shortC}</span></div><div><b class="num">${f(ms.long)}</b><span>${t.longC}</span></div><div><b class="num">${f(ms.promo)}</b><span>${t.promos}</span></div></div>`)}
${card(t.ends, `<div class="tg">${t.endW}</div>${endRows(st.ends.W, "w")}<div class="tg">${t.endL}</div>${endRows(st.ends.L, "l")}${st.ends.D.length ? `<div class="tg">${t.endD}</div>${endRows(st.ends.D, "d")}` : ""}`)}
${card(t.records, `<div class="rec">
<div><b class="num">${st.streaks.win}</b><span>${t.rWin}</span></div>
<div><b class="num">${st.streaks.unbeaten}</b><span>${t.rUnbeaten}</span></div>
<div><b class="num">${st.longest ? gameLink(st.longest.id, String(st.longest.len)) : "–"}</b><span>${t.rLongest}</span></div>
<div><b class="num">${st.quickMate ? gameLink(st.quickMate.id, String(st.quickMate.len)) : "–"}</b><span>${t.rQuick}</span></div>
<div><b class="num">${dec(ms.avgLen, lang)}</b><span>${t.rAvg}</span></div>
<div><b class="num">${st.maxDay || "–"}</b><span>${t.rDay}</span></div>
</div>`)}
</div>

<div class="grid g3">
${card(t.titled, st.titled.length ? st.titled.map(r => `<div class="tt"><span class="tag">${r.name}</span><span class="num">${fill(t.nGames, { n: f(r.n) })}</span>${wdl(r, t, 8)}<span class="num s">${p(r.s)}</span></div>`).join("") : `<p class="muted">${t.titledNone}</p>`)}
${card(t.beaten, st.beaten.map(b => `<div class="bt">${b.title ? titleTag(b.title) : "<span></span>"}<a href="https://lichess.org/${esc(b.id)}" target="_blank" rel="noopener"><b>${esc(b.name)}</b></a><span class="num gold">${b.rating}</span><span class="muted">${t.perf[b.perf] ?? esc(b.perf)} · ${b.year}</span></div>`).join("") || none)}
${card(t.opponents, st.opponents.map(o => `<div class="bt bt2"><a href="/@/${esc(o.name)}" rel="nofollow"><b>${esc(o.name)}</b></a><span class="num">${fill(t.nGames, { n: f(o.n) })}</span><span class="muted">${fill(t.wdlShort, { w: o.W, d: o.D, l: o.L })}</span></div>`).join("") || none)}
</div>

${footer(fill(t.source, { n: f(st.downloaded) }) + (st.voided ? fill(t.voided, { n: f(st.voided) }) : ""), `lichess.erhan.dev/@/${esc(name)}`)}
</main>`;

  return layout({
    lang, title: fill(t.statsTitle, { name: fullTitle }), desc, path: `/@/${name}`,
    image: `${ORIGIN}/og/${encodeURIComponent(u.id)}.png?v=${st.generatedAt}&lang=${lang}`,
    body, cls: "profile", search: true, type: "profile",
    jsonld: {
      "@type": "ProfilePage", name: fill(t.statsTitle, { name: fullTitle }), description: desc, inLanguage: lang,
      url: pageUrl(`/@/${name}`, lang), dateModified: new Date(state.updatedAt).toISOString(),
      mainEntity: {
        "@type": "Person", name: u.realName || name, alternateName: name, identifier: u.id,
        ...(u.title ? { honorificPrefix: u.title } : {}),
        url: `https://lichess.org/@/${name}`, sameAs: [`https://lichess.org/@/${name}`],
      },
    },
  });
}

// Every page in both languages, with the bare path as x-default.
export function sitemap(profiles: { name: string; updatedAt: number }[]) {
  const entry = (path: string, lastmod?: number) => {
    const links = LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(pageUrl(path, l))}"/>`).join("")
      + `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(ORIGIN + path)}"/>`;
    const mod = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : "";
    return LANGS.map(l => `<url><loc>${esc(pageUrl(path, l))}</loc>${mod}${links}</url>`).join("\n");
  };
  const newest = profiles[0]?.updatedAt;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entry("/", newest)}
${profiles.map(p => entry(`/@/${encodeURIComponent(p.name)}`, p.updatedAt)).join("\n")}
</urlset>
`;
}
