import { DICTS, type Lang } from "./i18n";

// Locale formatting done by hand so the output does not depend on the runtime's ICU data.
export const fmt = (n: number, l: Lang) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, l === "tr" ? "." : ",");
export const dec = (n: number, l: Lang, d = 1) => l === "tr" ? n.toFixed(d).replace(".", ",") : n.toFixed(d);
// Short form for tight spots such as chart labels: 2.1k, 63k, 1.2M.
export const compact = (n: number, l: Lang) =>
  n >= 1e6 ? dec(n / 1e6, l) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? dec(n / 1e3, l) + "k" : String(n);
export const pct = (n: number, l: Lang, d = 0) => l === "tr" ? "%" + dec(n, l, d) : dec(n, l, d) + "%";

// Dates are shown in Turkey time (UTC+3), where most users are.
export const date = (ms: number, l: Lang) => {
  const d = new Date(ms + 3 * 3600_000);
  return `${d.getUTCDate()} ${DICTS[l].months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const month = (ym: string, l: Lang) => { const [y, m] = ym.split("-").map(Number); return `${DICTS[l].months[m - 1]} ${y}`; };

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const PIECE_GLYPHS: [string, string][] = [["P", "♟"], ["N", "♞"], ["B", "♝"], ["R", "♜"], ["Q", "♛"], ["K", "♚"], ["O", "⇆"]];

// "TR" -> 🇹🇷; Lichess also uses regional codes such as "GB-ENG" and "_earth", which get no emoji.
export const flag = (code?: string | null) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0))) : "";
