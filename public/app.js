"use strict";

const $ = (s, el = document) => el.querySelector(s);
const T = JSON.parse($("#i18n")?.textContent || "{}");
const LANG = T.lang || "tr";
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, LANG === "tr" ? "." : ",");
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- theme ----------

function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}

document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });
});

// Keeps the language choice when following links to other profiles.
document.querySelectorAll(".seg a").forEach(a => a.addEventListener("click", () => {
  document.cookie = `lang=${a.hreflang}; path=/; max-age=31536000; samesite=lax`;
}));

// ---------- activity grid ----------
// Data is UTC (Monday first), shown in the viewer's own time zone.

function drawHeat(el) {
  const utc = el.dataset.heat.split(",").map(Number);
  const shift = Math.round(-new Date().getTimezoneOffset() / 60);
  const cells = new Array(168).fill(0);
  utc.forEach((v, i) => { cells[(((i + shift) % 168) + 168) % 168] += v; });
  const days = T.days;
  const max = Math.max(1, ...cells), cell = 19, gap = 3, left = 40, top = 8;
  let svg = "";
  for (let d = 0; d < 7; d++) {
    svg += `<text x="${left - 8}" y="${top + d * (cell + gap) + cell * 0.7}" text-anchor="end" class="ax">${days[d]}</text>`;
    for (let h = 0; h < 24; h++) {
      const v = cells[d * 24 + h];
      const x = left + h * (cell + gap), y = top + d * (cell + gap);
      const tip = `<title>${days[d]} ${String(h).padStart(2, "0")}:00 · ${v} ${T.gamesUnit}</title>`;
      svg += `<rect class="h0" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4">${tip}</rect>`;
      if (v) svg += `<rect class="h1" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill-opacity="${(0.12 + 0.88 * Math.pow(v / max, 0.7)).toFixed(2)}">${tip}</rect>`;
    }
  }
  for (let h = 0; h < 24; h += 3) svg += `<text x="${left + h * (cell + gap) + cell / 2}" y="${top + 7 * (cell + gap) + 14}" text-anchor="middle" class="ax">${String(h).padStart(2, "0")}</text>`;
  const W = left + 24 * (cell + gap), H = top + 7 * (cell + gap) + 22;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${svg}</svg>`;
  const label = $("[data-tzlabel]");
  if (label) {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    label.textContent = tz === "Europe/Istanbul" ? T.tzHome : fill(T.tzLocal, { tz: tz ? ", " + tz : "" });
  }
}

// ---------- import ----------
// Lichess rate-limits the IP that every Cloudflare Worker shares, so the visitor's browser downloads
// the games itself and posts them to the profile in order. The server checks and stores them.

const LICHESS = "https://lichess.org/api";
const PAGE = 5000;   // games per Lichess request
const BATCH = 300;   // games per post to the server

class Moved extends Error { constructor(state) { super("moved"); this.state = state; } }

async function getStatus(id) {
  return (await fetch(`/api/status/${encodeURIComponent(id)}`, { cache: "no-store" })).json();
}

async function send(id, body) {
  const res = await fetch(`/api/ingest/${encodeURIComponent(id)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.state) throw new Moved(data.state);
  if (!res.ok) throw new Error(data.error || `server ${res.status}`);
  return data;
}

// Lichess asks clients to wait a full minute after a 429.
async function lichess(url, ui, accept) {
  for (;;) {
    const res = await fetch(url, { headers: accept ? { Accept: accept } : {} });
    if (res.status !== 429) return res;
    ui.note(T.busy);
    await sleep(61_000);
    ui.note("");
  }
}

async function importPage(st, ui) {
  const id = st.id;
  if (st.needUser) {
    const res = await lichess(`${LICHESS}/user/${encodeURIComponent(id)}`, ui);
    if (res.status === 404) return send(id, { since: st.cursor, missing: true });
    if (!res.ok) throw new Error(`lichess ${res.status}`);
    return send(id, { since: st.cursor, user: await res.json() });
  }
  const q = new URLSearchParams({
    since: st.cursor, max: PAGE, sort: "dateAsc", moves: "true", opening: "true",
    accuracy: "true", clocks: "false", evals: "false", finished: "true",
  });
  const res = await lichess(`${LICHESS}/games/user/${encodeURIComponent(id)}?${q}`, ui, "application/x-ndjson");
  if (!res.ok || !res.body) throw new Error(`lichess ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", batch = [], n = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf += value;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        batch.push(JSON.parse(line));
        n++;
        ui.progress(st.fetched + batch.length, st.expected);
        if (batch.length >= BATCH) { st = await send(id, { since: st.cursor, games: batch }); batch = []; }
      }
      if (done) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (buf.trim()) batch.push(JSON.parse(buf));
  return send(id, { since: st.cursor, games: batch, done: n < PAGE });
}

// Runs until the profile leaves the "importing" state; returns the final state.
async function runImport(id, ui) {
  let st = await getStatus(id);
  let failures = 0;
  while (st.status === "importing") {
    try {
      st = await importPage(st, ui);
      ui.progress(st.fetched, st.expected);
      failures = 0;
    } catch (e) {
      if (e instanceof Moved) { st = e.state; await sleep(1500); continue; } // another tab got ahead
      if (++failures >= 5) { ui.note(T.stopped); throw e; }
      ui.note(T.retry);
      await sleep(4000 * failures);
      st = await getStatus(id);
    }
  }
  return st;
}

function initLoading(box) {
  const bar = $(".bar i", box), fetched = $("[data-fetched]", box), expected = $("[data-expected]", box), note = $("[data-note]", box);
  const ui = {
    progress(n, total) {
      fetched.textContent = fmt(n);
      if (total) expected.textContent = fmt(total);
      bar.style.width = (total ? Math.min(99, n / total * 100) : 3) + "%";
    },
    note(t) { note.textContent = t ? "· " + t : ""; },
  };
  const trainer = initPuzzle(box);
  runImport(box.dataset.import, ui).then(() => {
    // Do not pull the board away from someone in the middle of a puzzle.
    if (trainer?.touched()) trainer.ready();
    else location.reload();
  }, () => {});
}

// ---------- puzzles ----------
// 1000 puzzles from the Lichess puzzle database: [id, fen, uci moves, rating, themes].
// The first move is the opponent's; the solver plays every second move after it.

const FILES = "abcdefgh";
const sqIndex = s => FILES.indexOf(s[0]) + (Number(s[1]) - 1) * 8;
const sqName = i => FILES[i % 8] + (Math.floor(i / 8) + 1);
const isWhite = p => p === p.toUpperCase();

function parseFen(fen) {
  const [placement, turn] = fen.split(" ");
  const board = new Array(64).fill(null);
  placement.split("/").forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else board[(7 - r) * 8 + f++] = ch;
    }
  });
  return { board, turn };
}

// Applies a UCI move; legality is not checked because only the solution moves are accepted.
function applyMove(pos, uci) {
  const b = pos.board.slice();
  const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
  let piece = b[from];
  const kind = piece.toLowerCase();
  if (kind === "k" && Math.abs(to - from) === 2) {
    const rookFrom = to > from ? from + 3 : from - 4, rookTo = to > from ? from + 1 : from - 1;
    b[rookTo] = b[rookFrom]; b[rookFrom] = null;
  }
  if (kind === "p" && (to - from) % 8 !== 0 && !b[to]) b[to + (isWhite(piece) ? -8 : 8)] = null; // en passant
  if (uci.length > 4) piece = isWhite(piece) ? uci[4].toUpperCase() : uci[4];
  b[to] = piece; b[from] = null;
  return { board: b, turn: pos.turn === "w" ? "b" : "w" };
}

const LEVELS = { mixed: [0, 9999], easy: [0, 1200], medium: [1200, 1900], hard: [1900, 9999] };

function initPuzzle(host) {
  const root = document.createElement("section");
  root.className = "puzzle";
  root.innerHTML = `<div class="pz-board" aria-label="board"></div>
<div class="pz-side"><h2>${T.pzTitle}</h2>
<div class="pz-turn"><i></i><span></span></div>
<div class="pz-msg" role="status"></div>
<div class="pz-info"></div>
<div class="pz-btns"><button data-pz="hint">${T.pzHint}</button><button data-pz="solution">${T.pzSolution}</button><button data-pz="next" class="primary">${T.pzNext}</button></div>
<div class="pz-btns" style="margin-top:10px">${Object.keys(LEVELS).map(k => `<button data-level="${k}">${T["pz" + k[0].toUpperCase() + k.slice(1)]}</button>`).join("")}</div>
<div class="pz-score"></div><div class="pz-credit">${T.pzCredit}</div></div>`;
  host.after(root);
  const boardEl = $(".pz-board", root), msg = $(".pz-msg", root), info = $(".pz-info", root), score = $(".pz-score", root);
  const turnDot = $(".pz-turn i", root), turnText = $(".pz-turn span", root);

  const squares = [];
  for (let i = 0; i < 64; i++) { const d = document.createElement("div"); d.className = "sq"; boardEl.appendChild(d); squares.push(d); }

  let puzzles = [], pz = null, pos = null, step = 0, orient = "w", sel = null, last = [], busy = false, failed = false, hinted = false;
  let touched = false, solvedCount = Number(store.get("pz-solved") || 0), streak = 0;
  let level = store.get("pz-level") || "mixed";
  const seen = new Set();

  const say = (t, cls = "") => { msg.textContent = t; msg.className = "pz-msg " + cls; };
  const index = (row, col) => orient === "w" ? (7 - row) * 8 + col : row * 8 + (7 - col);

  function render() {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const i = index(row, col), el = squares[row * 8 + col];
      const p = pos.board[i];
      el.className = "sq" + ((Math.floor(i / 8) + (i % 8)) % 2 === 0 ? " dk" : "") + (last.includes(i) ? " last" : "") + (sel === i ? " sel" : "");
      el.dataset.i = i;
      el.innerHTML = (p ? `<div class="pc" style="background-image:url(/pieces/${isWhite(p) ? "w" : "b"}${p.toUpperCase()}.svg)"></div>` : "")
        + (row === 7 ? `<span class="co f">${FILES[i % 8]}</span>` : "") + (col === 0 ? `<span class="co r">${Math.floor(i / 8) + 1}</span>` : "");
    }
    score.innerHTML = fill(T.pzScore, { n: solvedCount, s: streak });
    root.querySelectorAll("[data-level]").forEach(b => b.classList.toggle("primary", b.dataset.level === level));
  }

  function play(uci) {
    pos = applyMove(pos, uci);
    last = [sqIndex(uci.slice(0, 2)), sqIndex(uci.slice(2, 4))];
    step++;
  }

  function pick() {
    const [lo, hi] = LEVELS[level];
    let pool = puzzles.filter(p => p[3] >= lo && p[3] < hi && !seen.has(p[0]));
    if (!pool.length) { seen.clear(); pool = puzzles.filter(p => p[3] >= lo && p[3] < hi); }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function load() {
    pz = pick(); seen.add(pz[0]);
    pos = parseFen(pz[1]); step = 0; sel = null; last = []; failed = false; hinted = false;
    orient = pos.turn === "w" ? "b" : "w"; // the solver answers the first move
    turnDot.className = orient; turnText.textContent = fill(T.pzTurn, { c: orient === "w" ? T.pzWhite : T.pzBlack });
    const themes = pz[4].split(" ").filter(t => !/^(short|long|veryLong|oneMove|master|masterVsMaster|superGM)$/.test(t)).slice(0, 3)
      .map(t => t.replace(/([A-Z])/g, " $1").replace(/(\d)/, " $1").toLowerCase()).join(" · ");
    info.innerHTML = `<span>${T.pzRating} <b>${pz[3]}</b></span>${themes ? `<span>${themes}</span>` : ""}<span><a href="https://lichess.org/training/${pz[0]}" target="_blank" rel="noopener">#${pz[0]}</a></span>`;
    say("");
    render();
    busy = true;
    await sleep(700);
    play(pz[2].split(" ")[0]);
    busy = false;
    render();
  }

  async function attempt(from, to) {
    const moves = pz[2].split(" ");
    const want = moves[step];
    if (!want || busy) return;
    touched = true;
    if (sqName(from) + sqName(to) !== want.slice(0, 4)) {
      failed = true; streak = 0;
      say(T.pzWrong, "no");
      const el = squares.find(s => Number(s.dataset.i) === to);
      el?.classList.add("bad"); setTimeout(() => el?.classList.remove("bad"), 500);
      sel = null; render();
      return;
    }
    sel = null;
    play(want);
    render();
    if (step >= moves.length) return done();
    say(T.pzGood, "ok");
    busy = true;
    await sleep(450);
    play(moves[step]);
    busy = false;
    render();
    if (step >= moves.length) done();
  }

  function done() {
    if (!failed && !hinted) { solvedCount++; streak++; store.set("pz-solved", solvedCount); }
    say(T.pzSolved, "ok");
    render();
  }

  async function showSolution() {
    const moves = pz[2].split(" ");
    if (busy || step >= moves.length) return;
    touched = true; failed = true; streak = 0; busy = true; sel = null;
    while (step < moves.length) { play(moves[step]); render(); await sleep(650); }
    busy = false;
    say(T.pzShown);
  }

  // Click a piece then a square, or drag it.
  let drag = null;
  const squareAt = (x, y) => {
    const r = boardEl.getBoundingClientRect();
    const col = Math.floor((x - r.left) / r.width * 8), row = Math.floor((y - r.top) / r.height * 8);
    return col < 0 || col > 7 || row < 0 || row > 7 ? null : index(row, col);
  };
  const mine = i => { const p = pos.board[i]; return p && (isWhite(p) ? "w" : "b") === orient && pos.turn === orient; };
  boardEl.addEventListener("pointerdown", e => {
    if (busy || !pz) return;
    const i = squareAt(e.clientX, e.clientY);
    if (i == null) return;
    if (sel != null && sel !== i && !mine(i)) { attempt(sel, i); return; }
    if (!mine(i)) { sel = null; render(); return; }
    sel = i; render();
    const r = boardEl.getBoundingClientRect(), size = r.width / 8;
    const ghost = document.createElement("div");
    ghost.className = "pc";
    ghost.style.cssText = `position:fixed;width:${size}px;height:${size}px;left:${e.clientX - size / 2}px;top:${e.clientY - size / 2}px;z-index:50;background-image:url(/pieces/${isWhite(pos.board[i]) ? "w" : "b"}${pos.board[i].toUpperCase()}.svg);background-size:100%;pointer-events:none;display:none`;
    document.body.appendChild(ghost);
    drag = { from: i, ghost, moved: false };
    boardEl.setPointerCapture(e.pointerId);
  });
  boardEl.addEventListener("pointermove", e => {
    if (!drag) return;
    const s = parseFloat(drag.ghost.style.width);
    drag.ghost.style.left = e.clientX - s / 2 + "px"; drag.ghost.style.top = e.clientY - s / 2 + "px";
    if (!drag.moved) { drag.moved = true; drag.ghost.style.display = "block"; const pc = squares.find(q => Number(q.dataset.i) === drag.from)?.querySelector(".pc"); if (pc) pc.style.opacity = ".3"; }
  });
  const endDrag = e => {
    if (!drag) return;
    const { from, ghost, moved } = drag;
    drag = null; ghost.remove();
    const to = squareAt(e.clientX, e.clientY);
    if (moved && to != null && to !== from) attempt(from, to); else render();
  };
  boardEl.addEventListener("pointerup", endDrag);
  boardEl.addEventListener("pointercancel", endDrag);

  root.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || !pz) return;
    if (b.dataset.pz === "next") load();
    else if (b.dataset.pz === "solution") showSolution();
    else if (b.dataset.pz === "hint") {
      const want = pz[2].split(" ")[step];
      if (!want || busy) return;
      hinted = true; touched = true; sel = sqIndex(want.slice(0, 2)); render();
    } else if (b.dataset.level) { level = b.dataset.level; store.set("pz-level", level); load(); }
  });

  fetch("/puzzles.json").then(r => r.json()).then(list => { puzzles = list; load(); }).catch(() => root.remove());

  return {
    touched: () => touched,
    ready() {
      const bar = document.createElement("div");
      bar.className = "pz-ready";
      bar.innerHTML = `<b>${T.pzReady}</b> <button class="primary">${T.pzView}</button>`;
      $(".pz-btns", root).before(bar);
      bar.querySelector("button").addEventListener("click", () => location.reload());
    },
  };
}

// ---------- share ----------

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}

function initShare(bar) {
  const url = location.origin + location.pathname;
  const title = bar.dataset.title;
  const toast = $(".toast", bar);
  const say = (t, keep) => { toast.textContent = t; clearTimeout(say.t); if (!keep) say.t = setTimeout(() => toast.textContent = "", 3000); };
  const shareBtn = $('[data-act="share"]', bar);
  if (!navigator.share) shareBtn.remove();
  $('[data-act="wa"]', bar).href = "https://wa.me/?text=" + encodeURIComponent(`${title} ${url}`);
  $('[data-act="x"]', bar).href = "https://x.com/intent/post?text=" + encodeURIComponent(title) + "&url=" + encodeURIComponent(url);

  // Brings the stored games up to date in the background, then reloads with the new numbers.
  const update = async btn => {
    const before = Number(bar.dataset.fetched);
    const ui = {
      progress(n) { say(fill(T.adding, { n: fmt(Math.max(0, n - before)) }), true); },
      note(t) { if (t) say(t, true); },
    };
    try {
      const st = await runImport(bar.dataset.id, ui);
      if (st.fetched > before) { say(T.reloading, true); location.reload(); }
      else { say(T.upToDate); if (btn) btn.remove(); }
    } catch { say(T.refreshFailed); }
  };
  if (bar.dataset.importing) update(null);

  bar.addEventListener("click", async e => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "share") {
      try { await navigator.share({ title, url }); } catch {}
    } else if (act === "copy") {
      try { await navigator.clipboard.writeText(url); say(T.copied); } catch { prompt("Link:", url); }
    } else if (act === "png") {
      const btn = e.target.closest("button");
      btn.disabled = true; say(T.preparing, true);
      try {
        if (!window.htmlToImage) await loadScript("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js");
        document.body.classList.add("capturing");
        // The card is centred with auto margins; the clone keeps them, which shifts the image and cuts off its right side.
        const card = $("#card");
        const data = await window.htmlToImage.toPng(card, {
          pixelRatio: 2, backgroundColor: getComputedStyle(document.body).backgroundColor, cacheBust: true,
          width: card.offsetWidth, height: card.offsetHeight, style: { margin: "0" },
        });
        const a = document.createElement("a");
        a.href = data; a.download = `${bar.dataset.name}-lichess.png`; a.click();
        say(T.downloaded);
      } catch { say(T.imgFailed); }
      document.body.classList.remove("capturing");
      btn.disabled = false;
    } else if (act === "refresh") {
      const btn = e.target.closest("button");
      btn.disabled = true;
      try {
        await fetch(`/api/refresh/${encodeURIComponent(bar.dataset.id)}`, { method: "POST" });
        await update(btn);
      } catch { say(T.refreshFailed); }
      btn.disabled = false;
    }
  });
}

document.querySelectorAll("[data-heat]").forEach(drawHeat);
const loading = $("[data-import]");
if (loading) initLoading(loading);
const share = $(".share");
if (share) initShare(share);
