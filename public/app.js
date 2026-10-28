"use strict";

const $ = (s, el = document) => el.querySelector(s);
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Activity grid: data is UTC (Monday first), shown in the viewer's own time zone.
function drawHeat(el) {
  const utc = el.dataset.heat.split(",").map(Number);
  const shift = Math.round(-new Date().getTimezoneOffset() / 60);
  const cells = new Array(168).fill(0);
  utc.forEach((v, i) => { cells[(((i + shift) % 168) + 168) % 168] += v; });
  const days = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const max = Math.max(1, ...cells), cell = 19, gap = 3, left = 40, top = 8;
  let svg = "";
  for (let d = 0; d < 7; d++) {
    svg += `<text x="${left - 8}" y="${top + d * (cell + gap) + cell * 0.7}" text-anchor="end" class="ax">${days[d]}</text>`;
    for (let h = 0; h < 24; h++) {
      const v = cells[d * 24 + h];
      const op = v ? 0.08 + 0.92 * Math.pow(v / max, 0.7) : 0.04;
      svg += `<rect x="${left + h * (cell + gap)}" y="${top + d * (cell + gap)}" width="${cell}" height="${cell}" rx="4" fill="#e3b55b" fill-opacity="${op.toFixed(2)}"><title>${days[d]} ${String(h).padStart(2, "0")}:00 · ${v} oyun</title></rect>`;
    }
  }
  for (let h = 0; h < 24; h += 3) svg += `<text x="${left + h * (cell + gap) + cell / 2}" y="${top + 7 * (cell + gap) + 14}" text-anchor="middle" class="ax">${String(h).padStart(2, "0")}</text>`;
  const W = left + 24 * (cell + gap), H = top + 7 * (cell + gap) + 22;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${svg}</svg>`;
  const label = $("[data-tzlabel]");
  if (label) {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    label.textContent = tz === "Europe/Istanbul" ? "(Türkiye saati)" : `(yerel saat${tz ? ", " + tz : ""})`;
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
    ui.note("Lichess yoğun, bir dakika bekleniyor…");
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
      if (++failures >= 5) { ui.note("İndirme durdu. Sayfayı yenileyip tekrar dene."); throw e; }
      ui.note("Bağlantı sorunu, tekrar deneniyor…");
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
  runImport(box.dataset.import, ui).then(() => location.reload(), () => {});
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
      progress(n) { say(`Yeni oyunlar ekleniyor… ${fmt(Math.max(0, n - before))}`, true); },
      note(t) { if (t) say(t, true); },
    };
    try {
      const st = await runImport(bar.dataset.id, ui);
      if (st.fetched > before) { say("Güncellendi, yenileniyor…", true); location.reload(); }
      else { say("Profil güncel"); if (btn) btn.remove(); }
    } catch { say("Güncellenemedi"); }
  };
  if (bar.dataset.importing) update(null);

  bar.addEventListener("click", async e => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "share") {
      try { await navigator.share({ title, url }); } catch {}
    } else if (act === "copy") {
      try { await navigator.clipboard.writeText(url); say("Link kopyalandı"); } catch { prompt("Link:", url); }
    } else if (act === "png") {
      const btn = e.target.closest("button");
      btn.disabled = true; say("Görsel hazırlanıyor…", true);
      try {
        if (!window.htmlToImage) await loadScript("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js");
        document.body.classList.add("capturing");
        // The card is centred with auto margins; the clone keeps them, which shifts the image and cuts off its right side.
        const card = $("#card");
        const data = await window.htmlToImage.toPng(card, {
          pixelRatio: 2, backgroundColor: "#120f0b", cacheBust: true,
          width: card.offsetWidth, height: card.offsetHeight, style: { margin: "0" },
        });
        const a = document.createElement("a");
        a.href = data; a.download = `${bar.dataset.name}-lichess.png`; a.click();
        say("Görsel indirildi");
      } catch { say("Görsel oluşturulamadı"); }
      document.body.classList.remove("capturing");
      btn.disabled = false;
    } else if (act === "refresh") {
      const btn = e.target.closest("button");
      btn.disabled = true;
      try {
        await fetch(`/api/refresh/${encodeURIComponent(bar.dataset.id)}`, { method: "POST" });
        await update(btn);
      } catch { say("Güncellenemedi"); }
      btn.disabled = false;
    }
  });
}

document.querySelectorAll("[data-heat]").forEach(drawHeat);
const loading = $("[data-import]");
if (loading) initLoading(loading);
const share = $(".share");
if (share) initShare(share);
