import type { Stats, Rec, Named } from "./stats";
import type { State } from "./profile";
import type { Entry } from "./registry";
import { fmt, dec, pct, date, isoDate, month, esc, flag, PERF_NAMES, END_NAMES, PIECES } from "./format";

export const ORIGIN = "https://lichess.erhan.dev";
const GREEN = "#7fb069", GREY = "#8d877c", RED = "#d8604a";

interface Layout { title: string; desc: string; path: string; image?: string; body: string; cls?: string; noindex?: boolean }

function layout(p: Layout) {
  const image = p.image ?? `${ORIGIN}/og-default.png`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${ORIGIN}${p.path}">
<meta property="og:type" content="profile"><meta property="og:site_name" content="Lichess Profil">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${ORIGIN}${p.path}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">
${p.noindex ? '<meta name="robots" content="noindex">' : ""}
<meta name="theme-color" content="#120f0b">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css?v=6">
<script src="/app.js?v=6" defer></script>
</head><body class="${p.cls ?? ""}">${p.body}</body></html>`;
}

const brand = `<a class="brand" href="/"><span class="brand-k">♞</span> Lichess Profil</a>`;

function searchForm(value = "", autofocus = false) {
  return `<form class="search" action="/go" method="get" role="search">
<input name="u" value="${esc(value)}" placeholder="Lichess kullanıcı adı" aria-label="Lichess kullanıcı adı" autocomplete="off" autocapitalize="off" spellcheck="false" required pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{1,29}"${autofocus ? " autofocus" : ""}>
<button type="submit">Analiz et</button></form>`;
}

const titleTag = (t?: string | null) => t ? `<span class="tag">${esc(t)}</span>` : "";

export function homePage(reg: { total: number; recent: Entry[] }) {
  const cards = reg.recent.map(e => `<a class="pcard" href="/@/${esc(e.name)}">
<span class="mono">${esc(e.name[0].toUpperCase())}</span>
<span class="pc-n">${titleTag(e.title)}${esc(e.name)} ${flag(e.flag)}</span>
<span class="pc-s">${fmt(e.games)} oyun · ${pct(e.score)} skor${e.blitz ? ` · blitz ${e.blitz}` : ""}</span></a>`).join("");
  return layout({
    title: "Lichess Profil — oyun istatistikleri",
    desc: "Lichess kullanıcı adını yaz, tüm oyunlarından kariyer istatistiklerini çıkaralım: sonuçlar, açılışlar, rakipler, rekorlar.",
    path: "/",
    cls: "home",
    body: `<main class="wrap narrow">${brand}
<h1 class="home-h">Lichess'teki tüm oyunlarının <em>tek sayfalık hikâyesi</em></h1>
<p class="lead">Kullanıcı adını yaz; tüm oyunlarını indirip galibiyetlerden açılışlara, en güçlü rakiplerden en uzun serilere kadar bir profil sayfası hazırlayalım. Sayfa kaydedilir ve paylaşılabilir.</p>
${searchForm("", true)}
${reg.recent.length ? `<h2 class="sec">Son hazırlanan profiller <span class="muted">${fmt(reg.total)} profil</span></h2><div class="pgrid">${cards}</div>` : ""}
<footer class="foot"><span>Veriler Lichess'in açık API'sinden alınır.</span><span>lichess.erhan.dev</span></footer></main>`,
  });
}

export function messagePage(title: string, text: string, value = "", status = "") {
  return layout({
    title: `${title} — Lichess Profil`, desc: text, path: "/", cls: "home", noindex: true,
    body: `<main class="wrap narrow">${brand}<h1 class="home-h">${esc(title)}</h1><p class="lead">${text}</p>${status}${searchForm(value)}</main>`,
  });
}

export function loadingPage(state: State) {
  const pctDone = state.expected ? Math.min(99, Math.round(state.fetched / state.expected * 100)) : 0;
  return layout({
    title: `${state.name} hazırlanıyor — Lichess Profil`,
    desc: `${state.name} için Lichess oyunları indiriliyor.`,
    path: `/@/${state.name}`, cls: "home", noindex: true,
    body: `<main class="wrap narrow">${brand}
<div class="loading" data-import="${esc(state.id)}">
<h1 class="home-h">${esc(state.name)}</h1>
<p class="lead">Oyunlar tarayıcın üzerinden Lichess'ten indirilip kaydediliyor. Lichess saniyede yaklaşık 20 oyun verdiği için büyük hesaplar birkaç dakika sürebilir. <b>Bu sayfa açık kalmalı</b>; kapatırsan kaldığı yerden devam eder.</p>
<noscript><p class="lead">İndirme için JavaScript gerekiyor.</p></noscript>
<div class="bar"><i style="width:${pctDone}%"></i></div>
<p class="prog"><b data-fetched>${fmt(state.fetched)}</b> / <span data-expected>${fmt(state.expected)}</span> oyun <span class="muted" data-note></span></p>
</div></main>`,
  });
}

// ---------- profile ----------

function wdl(r: Rec, h = 12) {
  const n = r.n || 1;
  return `<div class="wdl" style="height:${h}px" title="${r.W}G ${r.D}B ${r.L}M"><i style="width:${(r.W / n * 100).toFixed(2)}%;background:${GREEN}"></i><i style="width:${(r.D / n * 100).toFixed(2)}%;background:${GREY}"></i><i style="width:${(r.L / n * 100).toFixed(2)}%;background:${RED}"></i></div>`;
}

function donut(r: Rec) {
  const S = 230, R = S / 2 - 14, cx = S / 2;
  let a0 = -Math.PI / 2;
  const tot = r.n || 1;
  const arcs = [[r.W, GREEN], [r.D, GREY], [r.L, RED]].filter(([v]) => (v as number) > 0).map(([v, col]) => {
    const a1 = a0 + (v as number) / tot * 2 * Math.PI;
    const end = (v as number) === tot ? a1 - 0.0001 : a1 - 0.012;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M${(cx + R * Math.cos(a0)).toFixed(1)},${(cx + R * Math.sin(a0)).toFixed(1)} A${R},${R} 0 ${large} 1 ${(cx + R * Math.cos(end)).toFixed(1)},${(cx + R * Math.sin(end)).toFixed(1)}`;
    a0 = a1;
    return `<path d="${d}" stroke="${col}" stroke-width="26" fill="none"/>`;
  }).join("");
  return `<svg class="donut" viewBox="0 0 ${S} ${S}">${arcs}<text x="${cx}" y="${cx - 2}" text-anchor="middle" class="d-big">${pct(r.s, 1)}</text><text x="${cx}" y="${cx + 26}" text-anchor="middle" class="d-sub">PUAN ORANI</text></svg>`;
}

function yearChart(years: Stats["years"]) {
  const W = 570, H = 230;
  const mx = Math.max(1, ...years.map(y => y.n));
  const bw = (W - 40) / Math.max(1, years.length);
  const out: string[] = [];
  years.forEach((y, i) => {
    const x = 20 + i * bw, bh = y.n / mx * (H - 70), top = H - 30 - bh;
    let seg = top;
    for (const [v, col] of [[y.W, GREEN], [y.D, GREY], [y.L, RED]] as [number, string][]) {
      const sh = v / Math.max(1, y.n) * bh;
      out.push(`<rect x="${(x + bw * .18).toFixed(1)}" y="${seg.toFixed(1)}" width="${(bw * .64).toFixed(1)}" height="${sh.toFixed(1)}" fill="${col}"/>`);
      seg += sh;
    }
    out.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(top - 8).toFixed(1)}" text-anchor="middle" class="ax-v">${fmt(y.n)}</text>`);
    out.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="ax">’${String(y.year).slice(2)}</text>`);
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`;
}

const kpi = (v: string, label: string, sub = "") => `<div class="kpi"><div class="kv">${v}</div><div class="kl">${label}</div>${sub ? `<div class="ks">${sub}</div>` : ""}</div>`;

function openingRows(list: Named[]) {
  if (!list.length) return `<p class="muted">Veri yok.</p>`;
  const mx = Math.max(...list.map(o => o.n));
  return list.map(o => `<div class="op"><div class="opn" title="${esc(o.name)}">${esc(o.name)}</div><div class="opb"><div style="width:${(o.n / mx * 100).toFixed(1)}%">${wdl(o, 8)}</div></div><div class="num">${fmt(o.n)}</div><div class="num s">${pct(o.s)}</div></div>`).join("");
}

function endRows(list: [string, number][], col: string) {
  return list.filter(([, p]) => p >= 0.5).map(([k, p]) => `<div class="tr"><span>${END_NAMES[k] ?? esc(k)}</span><div class="tb"><i style="width:${p}%;background:${col}"></i></div><b>${pct(p)}</b></div>`).join("");
}

const moveList = (l: [string, number][], prefix: string) => l.slice(0, 4).map(([m, p]) => `<b>${prefix}${esc(m)}</b> ${pct(p)}`).join(" · ");
const gameLink = (id: string, text: string) => `<a href="https://lichess.org/${esc(id)}" target="_blank" rel="noopener">${text}</a>`;

export function profilePage(st: Stats, state: State) {
  const u = st.user;
  const name = u.name;
  const fullTitle = `${u.title ? u.title + " " : ""}${u.realName || name}`;
  const desc = `${fmt(st.all.n)} oyun · ${fmt(st.all.W)} galibiyet · ${pct(st.all.s, 1)} skor · ${fmt(st.moves.own)} hamle. ${name} adlı oyuncunun Lichess kariyer istatistikleri.`;
  const ms = st.moves;
  const pieceTot = Object.values(ms.pieces).reduce((a, b) => a + b, 0) || 1;
  const pieceMax = Math.max(1, ...Object.values(ms.pieces));
  const perfRows = st.perfs.filter(p => p.n >= 3).map(p => `<tr><td class="pn">${PERF_NAMES[p.key] ?? p.key}</td><td class="num">${fmt(p.n)}</td><td class="barc">${wdl(p)}</td><td class="num s">${pct(p.s)}</td><td class="num">${p.cur ?? "–"}</td><td class="num gold">${p.peak ?? "–"}</td></tr>`).join("");
  const hours = Math.round(u.playTime / 3600);
  const canRefresh = state.status === "ready" && Date.now() - state.updatedAt > 3600_000;
  const sub = [u.location && esc(u.location), `<a href="https://lichess.org/@/${esc(name)}" target="_blank" rel="noopener">lichess.org/@/${esc(name)}</a>`].filter(Boolean).join(" · ");

  const body = `<div class="wrap" id="card">
<div class="topbar">${brand}${searchForm()}</div>
<header class="hero"><div class="who"><div class="ph"><span>${esc(name[0].toUpperCase())}</span></div><div>
<div class="eyebrow">LICHESS KARİYER ANALİZİ</div>
<h1>${titleTag(u.title)}${esc(u.realName || name)} <span class="fl">${flag(u.flag)}</span></h1>
<div class="hsub">${u.realName ? `<b>${esc(name)}</b> · ` : ""}${sub}</div></div></div>
<div class="hr">Üyelik <b>${date(u.createdAt)}</b><br>Veri ${date(st.first)} – ${date(st.last)}<br><span class="muted">Güncellendi ${date(state.updatedAt)}</span></div></header>

<div class="share" data-name="${esc(name)}" data-id="${esc(u.id)}" data-fetched="${state.fetched}"${state.status === "importing" ? " data-importing=\"1\"" : ""} data-title="${esc(fullTitle)} — Lichess istatistikleri">
<button data-act="share" class="primary">Paylaş</button><button data-act="copy">Linki kopyala</button>
<a data-act="wa" target="_blank" rel="noopener">WhatsApp</a><a data-act="x" target="_blank" rel="noopener">X</a>
<button data-act="png">Görsel indir</button>
${canRefresh ? `<button data-act="refresh" class="ghost">Güncelle</button>` : ""}<span class="toast" role="status"></span></div>

<div class="kpis">
${kpi(fmt(st.all.n), "OYUN", `${fmt(st.rated.n)} puanlı`)}
${kpi(fmt(st.all.W), "GALİBİYET", pct(st.all.n ? st.all.W / st.all.n * 100 : 0, 1))}
${kpi(fmt(ms.own), "HAMLE", `iki taraf ${fmt(ms.plies)} yarım hamle`)}
${kpi(fmt(hours), "SAAT OYUN", `≈ ${fmt(hours / 24)} gün kesintisiz`)}
${kpi(fmt(st.distinctOpponents), "FARKLI RAKİP", `${fmt(st.tournaments.games)} turnuva oyunu · ${fmt(st.tournaments.arenas + st.tournaments.swiss)} turnuva`)}
${kpi(st.accuracy ? pct(st.accuracy.avg, 1) : "–", "ORT. DOĞRULUK", st.accuracy ? `${fmt(st.accuracy.n)} analizli oyunda` : "analizli oyun yok")}
</div>

<div class="grid g-res">
<section class="card"><h2>SONUÇLAR</h2><div class="res">${donut(st.all)}<div class="rb">
<div class="big3"><div style="--c:${GREEN}"><b class="num">${fmt(st.all.W)}</b><span>galibiyet</span></div><div style="--c:${GREY}"><b class="num">${fmt(st.all.D)}</b><span>beraberlik</span></div><div style="--c:${RED}"><b class="num">${fmt(st.all.L)}</b><span>mağlubiyet</span></div></div>
<div class="colrow"><span>♔ Beyaz</span>${wdl(st.white)}<span class="num s">${pct(st.white.s, 1)}</span></div>
<div class="colrow"><span>♚ Siyah</span>${wdl(st.black)}<span class="num s">${pct(st.black.s, 1)}</span></div>
<div class="colrow"><span>Puanlı</span>${wdl(st.rated)}<span class="num s">${pct(st.rated.s, 1)}</span></div>
<div class="muted note">${fmt(st.white.n)} beyaz · ${fmt(st.black.n)} siyah · ${fmt(st.casual.n)} puansız oyun</div>
</div></div></section>
<section class="card"><h2>TEMPOYA GÖRE</h2><div class="tscroll"><table><tr><th>TEMPO</th><th>OYUN</th><th class="barh">G / B / M</th><th>SKOR</th><th>GÜNCEL</th><th>ZİRVE</th></tr>${perfRows}</table></div>
<div class="legend"><span style="--c:${GREEN}">Galibiyet</span><span style="--c:${GREY}">Beraberlik</span><span style="--c:${RED}">Mağlubiyet</span></div></section>
</div>

<div class="grid g2">
<section class="card"><h2>YILLARA GÖRE OYUN SAYISI</h2>${yearChart(st.years)}</section>
<section class="card"><h2>NE ZAMAN OYNUYOR? <span class="muted lc" data-tzlabel></span></h2><div class="heat" data-heat="${st.heat.join(",")}"></div>
<div class="muted note">${st.busiestDay ? `En yoğun gün: <b>${isoDate(st.busiestDay.date)}</b> · ${st.busiestDay.n} oyun · ` : ""}toplam ${fmt(st.activeDays)} farklı günde oynadı${st.busiestMonth ? ` · en yoğun ay ${month(st.busiestMonth.month)}` : ""}</div></section>
</div>

<div class="grid g2">
<section class="card"><h2>BEYAZLA AÇILIŞLAR</h2>${openingRows(st.openings.white)}${st.firstMove.length ? `<div class="muted note">İlk hamle: ${moveList(st.firstMove, "1.")}</div>` : ""}</section>
<section class="card"><h2>SİYAHLA AÇILIŞLAR</h2>${openingRows(st.openings.black)}${st.vsE4.length || st.vsD4.length ? `<div class="muted note">${st.vsE4.length ? `1.e4'e: ${moveList(st.vsE4, "1…")}` : ""}${st.vsE4.length && st.vsD4.length ? "<br>" : ""}${st.vsD4.length ? `1.d4'e: ${moveList(st.vsD4, "1…")}` : ""}</div>` : ""}</section>
</div>

<div class="grid g3">
<section class="card"><h2>HAMLE PROFİLİ</h2><div class="pieces">${PIECES.map(([k, g, n]) => `<div class="pcol"><div class="pbar"><i style="height:${((ms.pieces[k] ?? 0) / pieceMax * 100).toFixed(1)}%"></i></div><div class="pg">${g}</div><div class="pl">${n}</div><div class="pp">${pct((ms.pieces[k] ?? 0) / pieceTot * 100)}</div></div>`).join("")}</div>
<div class="mini"><div><b class="num">${fmt(ms.cap)}</b><span>taş alma</span></div><div><b class="num">${fmt(ms.chk)}</b><span>şah çekme</span></div><div><b class="num">${fmt(ms.mate)}</b><span>mat hamlesi</span></div>
<div><b class="num">${fmt(ms.short)}</b><span>kısa rok</span></div><div><b class="num">${fmt(ms.long)}</b><span>uzun rok</span></div><div><b class="num">${fmt(ms.promo)}</b><span>terfi</span></div></div></section>
<section class="card"><h2>OYUNLAR NASIL BİTTİ?</h2>
<div class="tg">KAZANDIKLARI</div>${endRows(st.ends.W, GREEN)}
<div class="tg">KAYBETTİKLERİ</div>${endRows(st.ends.L, RED)}
${st.ends.D.length ? `<div class="tg">BERABERLİKLER</div>${endRows(st.ends.D, GREY)}` : ""}</section>
<section class="card"><h2>REKORLAR</h2><div class="rec">
<div><b class="num">${st.streaks.win}</b><span>üst üste galibiyet</span></div>
<div><b class="num">${st.streaks.unbeaten}</b><span>maçlık yenilmezlik serisi</span></div>
<div><b class="num">${st.longest ? gameLink(st.longest.id, String(st.longest.len)) : "–"}</b><span>hamle · en uzun oyun</span></div>
<div><b class="num">${st.quickMate ? gameLink(st.quickMate.id, String(st.quickMate.len)) : "–"}</b><span>hamle · en hızlı mat</span></div>
<div><b class="num">${dec(ms.avgLen)}</b><span>ortalama oyun uzunluğu</span></div>
<div><b class="num">${st.busiestDay?.n ?? "–"}</b><span>bir günde en çok oyun</span></div>
</div></section>
</div>

<div class="grid g3">
<section class="card"><h2>UNVANLI RAKİPLERE KARŞI</h2>${st.titled.length ? st.titled.map(t => `<div class="tt"><span class="tag">${t.name}</span><span class="num">${fmt(t.n)} oyun</span>${wdl(t, 8)}<span class="num s">${pct(t.s)}</span></div>`).join("") : `<p class="muted">Unvanlı rakiple yeterli oyun yok.</p>`}</section>
<section class="card"><h2>YENDİĞİ EN GÜÇLÜ RAKİPLER</h2>${st.beaten.map(b => `<div class="bt">${b.title ? titleTag(b.title) : "<span></span>"}<a href="https://lichess.org/${esc(b.id)}" target="_blank" rel="noopener"><b>${esc(b.name)}</b></a><span class="num gold">${b.rating}</span><span class="muted">${PERF_NAMES[b.perf] ?? esc(b.perf)} · ${b.year}</span></div>`).join("") || `<p class="muted">Veri yok.</p>`}</section>
<section class="card"><h2>EN ÇOK KARŞILAŞTIĞI RAKİPLER</h2>${st.opponents.map(o => `<div class="bt bt2"><a href="/@/${esc(o.name)}"><b>${esc(o.name)}</b></a><span class="num">${fmt(o.n)} oyun</span><span class="muted">${o.W}G ${o.D}B ${o.L}M</span></div>`).join("") || `<p class="muted">Veri yok.</p>`}</section>
</div>

<footer class="foot"><span>Kaynak: Lichess açık API · ${fmt(st.downloaded)} oyun${st.voided ? ` (${fmt(st.voided)} iptal edilen hariç)` : ""}</span><span>lichess.erhan.dev/@/${esc(name)}</span></footer>
</div>`;

  return layout({
    title: `${fullTitle} — Lichess istatistikleri`,
    desc,
    path: `/@/${name}`,
    image: `${ORIGIN}/og/${encodeURIComponent(u.id)}.png?v=${st.generatedAt}`,
    body,
    cls: "profile",
  });
}
