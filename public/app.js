"use strict";

const $ = (s, el = document) => el.querySelector(s);
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// Activity grid: data is UTC (Monday first), shown in the viewer's own time zone.
function drawHeat(el) {
  const utc = el.dataset.heat.split(",").map(Number);
  const shift = -new Date().getTimezoneOffset() / 60;
  const cells = new Array(168).fill(0);
  utc.forEach((v, i) => { cells[(((i + Math.round(shift)) % 168) + 168) % 168] += v; });
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

// Polls an import until the profile is ready, then reloads the page.
function poll(id, onTick) {
  const tick = async () => {
    try {
      const s = await (await fetch(`/api/status/${encodeURIComponent(id)}`)).json();
      onTick && onTick(s);
      if (s.status === "ready" || s.status === "error" || s.status === "missing" || s.status === "closed") return location.reload();
    } catch {}
    setTimeout(tick, 2000);
  };
  tick();
}

function initLoading(box) {
  const bar = $(".bar i", box), fetched = $("[data-fetched]", box), expected = $("[data-expected]", box), note = $("[data-note]", box);
  poll(box.dataset.poll, s => {
    fetched.textContent = fmt(s.fetched || 0);
    if (s.expected) expected.textContent = fmt(s.expected);
    bar.style.width = (s.expected ? Math.min(99, s.fetched / s.expected * 100) : 5) + "%";
    note.textContent = s.waitUntil && s.waitUntil > Date.now() ? "· Lichess yoğun, kısa bir mola veriliyor…" : "";
  });
}

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}

function initShare(bar) {
  const url = location.origin + location.pathname;
  const title = bar.dataset.title;
  const toast = $(".toast", bar);
  const say = t => { toast.textContent = t; clearTimeout(say.t); say.t = setTimeout(() => toast.textContent = "", 3000); };
  const shareBtn = $('[data-act="share"]', bar);
  if (!navigator.share) shareBtn.remove();
  $('[data-act="wa"]', bar).href = "https://wa.me/?text=" + encodeURIComponent(`${title} ${url}`);
  $('[data-act="x"]', bar).href = "https://x.com/intent/post?text=" + encodeURIComponent(title) + "&url=" + encodeURIComponent(url);

  bar.addEventListener("click", async e => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "share") {
      try { await navigator.share({ title, url }); } catch {}
    } else if (act === "copy") {
      try { await navigator.clipboard.writeText(url); say("Link kopyalandı"); } catch { prompt("Link:", url); }
    } else if (act === "png") {
      const btn = e.target.closest("button");
      btn.disabled = true; say("Görsel hazırlanıyor…");
      try {
        if (!window.htmlToImage) await loadScript("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js");
        const card = $("#card");
        document.body.classList.add("capturing");
        const data = await window.htmlToImage.toPng(card, { pixelRatio: 2, backgroundColor: "#120f0b", cacheBust: true });
        const a = document.createElement("a");
        a.href = data; a.download = `${bar.dataset.name}-lichess.png`; a.click();
        say("Görsel indirildi");
      } catch { say("Görsel oluşturulamadı"); }
      document.body.classList.remove("capturing");
      btn.disabled = false;
    } else if (act === "refresh") {
      const btn = e.target.closest("button");
      btn.disabled = true; btn.textContent = "Güncelleniyor…";
      try {
        const s = await (await fetch(`/api/refresh/${encodeURIComponent(bar.dataset.name)}`, { method: "POST" })).json();
        if (s.status === "importing") {
          const start = s.fetched;
          poll(bar.dataset.name, st => { btn.textContent = `Güncelleniyor… ${fmt(Math.max(0, st.fetched - start))} yeni oyun`; });
        } else { btn.textContent = "Güncel"; }
      } catch { btn.textContent = "Güncellenemedi"; }
    }
  });
}

document.querySelectorAll("[data-heat]").forEach(drawHeat);
const loading = $("[data-poll]");
if (loading) initLoading(loading);
const share = $(".share");
if (share) initShare(share);
