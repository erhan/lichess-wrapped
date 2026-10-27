// Turkish number/date formatting without relying on the runtime's ICU data.
export const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const dec = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
export const pct = (n: number, d = 0) => "%" + dec(n, d);

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const date = (ms: number) => { const d = new Date(ms + 3 * 3600_000); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const isoDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const month = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const PERF_NAMES: Record<string, string> = {
  ultraBullet: "UltraBullet", bullet: "Bullet", blitz: "Blitz", rapid: "Rapid", classical: "Klasik",
  correspondence: "Yazışmalı", variants: "Varyantlar", chess960: "Chess960", puzzle: "Bulmaca",
};

export const END_NAMES: Record<string, string> = {
  mate: "Mat", resign: "Terk", outoftime: "Süre", timeout: "Bağlantı koptu", draw: "Anlaşmalı / kural",
  stalemate: "Pat", cheat: "Hile tespiti", variantEnd: "Varyant sonu", noStart: "Başlamadı",
};

export const PIECES: [string, string, string][] = [
  ["P", "♟", "Piyon"], ["N", "♞", "At"], ["B", "♝", "Fil"], ["R", "♜", "Kale"], ["Q", "♛", "Vezir"], ["K", "♚", "Şah"], ["O", "⇆", "Rok"],
];

// "TR" -> 🇹🇷; Lichess also uses regional codes such as "GB-ENG" and "_earth", which get no emoji.
export const flag = (code?: string | null) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0))) : "";
