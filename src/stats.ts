import type { Game } from "./game";
import type { LichessUser } from "./lichess";

export interface Rec { n: number; W: number; D: number; L: number; s: number }
interface PerfRow extends Rec { key: string; peak: number | null; cur: number | null }
export interface Named extends Rec { name: string }
interface Beaten { name: string; title?: string; rating: number; perf: string; year: number; id: string }

export interface Stats {
  v: number;
  user: {
    id: string; name: string; title?: string; flag?: string; realName?: string; location?: string;
    createdAt: number; playTime: number;
    perfs: Record<string, { rating?: number; games?: number; prov?: boolean }>;
  };
  generatedAt: number;
  first: number; last: number;
  downloaded: number; voided: number;
  all: Rec; white: Rec; black: Rec; rated: Rec; casual: Rec;
  perfs: PerfRow[];
  moves: {
    own: number; plies: number; avgLen: number;
    pieces: Record<string, number>;
    cap: number; chk: number; mate: number; short: number; long: number; promo: number;
  };
  longest?: { id: string; len: number; r: string };
  quickMate?: { id: string; len: number };
  ends: { W: [string, number][]; L: [string, number][]; D: [string, number][] };
  years: (Rec & { year: number })[];
  heat: number[];                 // 7*24 cells, UTC, Monday first
  busiestDay?: { date: string; n: number };
  activeDays: number;
  busiestMonth?: { month: string; n: number };
  openings: { white: Named[]; black: Named[] };
  firstMove: [string, number][];
  vsE4: [string, number][];
  vsD4: [string, number][];
  titled: Named[];
  beaten: Beaten[];
  opponents: Named[];
  distinctOpponents: number;
  streaks: { win: number; unbeaten: number; loss: number };
  accuracy?: { n: number; avg: number; acpl: number; inacc: number; mist: number; blun: number };
  tournaments: { games: number; arenas: number; swiss: number };
}

// Stored profiles with an older version are rebuilt from their games the next time they are opened.
export const STATS_VERSION = 2;

const STANDARD_PERFS = ["ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence"];
const TITLES = ["GM", "IM", "FM", "CM", "NM", "WGM", "WIM", "WFM", "WCM", "LM", "BOT"];

class Counter<K> extends Map<K, number> {
  inc(k: K, by = 1) { this.set(k, (this.get(k) ?? 0) + by); }
  top(n: number): [K, number][] { return [...this.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); }
}

class RecAcc {
  W = 0; D = 0; L = 0;
  add(r: string) { if (r === "W") this.W++; else if (r === "D") this.D++; else if (r === "L") this.L++; }
  get n() { return this.W + this.D + this.L; }
  out(): Rec { const n = this.n; return { n, W: this.W, D: this.D, L: this.L, s: n ? Math.round((this.W + this.D / 2) / n * 1000) / 10 : 0 }; }
}

class Grouped<K> extends Map<K, RecAcc> {
  add(k: K, r: string) { let a = this.get(k); if (!a) this.set(k, a = new RecAcc()); a.add(r); }
  top(n: number) { return [...this.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n); }
}

const PIECE: Record<string, string> = { N: "N", B: "B", R: "R", Q: "Q", K: "K" };

// Feed games oldest-first with add(), then call finish().
export class Aggregator {
  private downloaded = 0; private voided = 0;
  private all = new RecAcc(); private white = new RecAcc(); private black = new RecAcc();
  private rated = new RecAcc(); private casual = new RecAcc();
  private perf = new Grouped<string>(); private peak = new Map<string, number>();
  private pieces = new Counter<string>();
  private mm = { cap: 0, chk: 0, mate: 0, short: 0, long: 0, promo: 0 };
  private own = 0; private plies = 0; private validPlies = 0;
  private longest?: Game; private quick?: Game;
  private ends = { W: new Counter<string>(), L: new Counter<string>(), D: new Counter<string>() };
  private years = new Grouped<number>();
  private heat = new Array<number>(168).fill(0);
  private days = new Counter<string>(); private months = new Counter<string>();
  private opW = new Grouped<string>(); private opB = new Grouped<string>();
  private first = new Counter<string>(); private e4 = new Counter<string>(); private d4 = new Counter<string>();
  private titled = new Grouped<string>();
  private beaten: Beaten[] = [];
  private opp = new Grouped<string>();
  private cw = 0; private cu = 0; private cl = 0; private bw = 0; private bu = 0; private bl = 0;
  private acc = { n: 0, sum: 0, acpl: 0, inacc: 0, mist: 0, blun: 0 };
  private tourGames = 0; private arenas = new Set<string>(); private swiss = new Set<string>();
  private firstAt = Infinity; private lastAt = 0;

  add(g: Game) {
    this.downloaded++;
    this.firstAt = Math.min(this.firstAt, g.at); this.lastAt = Math.max(this.lastAt, g.at);
    const moves = g.mv ? g.mv.split(" ") : [];
    this.plies += moves.length;
    const d = new Date(g.at);
    this.heat[((d.getUTCDay() + 6) % 7) * 24 + d.getUTCHours()]++;
    this.days.inc(d.toISOString().slice(0, 10));
    this.months.inc(d.toISOString().slice(0, 7));
    for (let i = g.c === "w" ? 0 : 1; i < moves.length; i += 2) this.countMove(moves[i]);
    if (g.r === "X") { this.voided++; return; }

    const r = g.r;
    this.validPlies += moves.length;
    this.all.add(r);
    (g.c === "w" ? this.white : this.black).add(r);
    (g.rated ? this.rated : this.casual).add(r);
    const std = g.variant === "standard";
    if (std) {
      this.perf.add(g.perf, r);
      if (g.rated && g.mr != null) {
        const after = g.mr + (g.md ?? 0);
        if (after > (this.peak.get(g.perf) ?? 0)) this.peak.set(g.perf, after);
      }
    } else {
      this.perf.add("variants", r);
    }
    if (!this.longest || moves.length > this.longest.mv.split(" ").length) this.longest = g;
    if (r === "W" && g.status === "mate" && std && (!this.quick || moves.length < this.quick.mv.split(" ").length)) this.quick = g;
    this.ends[r].inc(g.status);
    this.years.add(d.getUTCFullYear(), r);

    if (std && g.op) (g.c === "w" ? this.opW : this.opB).add(g.op.split(":")[0], r);
    if (std && moves.length) {
      if (g.c === "w") this.first.inc(moves[0]);
      else if (moves.length > 1 && moves[0] === "e4") this.e4.inc(moves[1]);
      else if (moves.length > 1 && moves[0] === "d4") this.d4.inc(moves[1]);
    }
    if (g.ot && TITLES.includes(g.ot)) this.titled.add(g.ot, r);
    if (r === "W" && std && g.rated && !g.oprov && g.or != null && g.on) {
      this.beaten.push({ name: g.on, title: g.ot, rating: g.or, perf: g.perf, year: d.getUTCFullYear(), id: g.id });
      if (this.beaten.length > 200) this.trimBeaten();
    }
    if (g.on) this.opp.add(g.on, r);

    this.cw = r === "W" ? this.cw + 1 : 0;
    this.cu = r !== "L" ? this.cu + 1 : 0;
    this.cl = r === "L" ? this.cl + 1 : 0;
    this.bw = Math.max(this.bw, this.cw); this.bu = Math.max(this.bu, this.cu); this.bl = Math.max(this.bl, this.cl);

    if (g.acc != null) {
      this.acc.n++; this.acc.sum += g.acc; this.acc.acpl += g.acpl ?? 0;
      this.acc.inacc += g.inacc ?? 0; this.acc.mist += g.mist ?? 0; this.acc.blun += g.blun ?? 0;
    }
    if (g.tour) {
      this.tourGames++;
      (g.tour.startsWith("a:") ? this.arenas : this.swiss).add(g.tour);
    }
  }

  private countMove(m: string) {
    this.own++;
    if (m.startsWith("O-O-O")) { this.mm.long++; this.pieces.inc("O"); return; }
    if (m.startsWith("O-O")) { this.mm.short++; this.pieces.inc("O"); return; }
    this.pieces.inc(PIECE[m[0]] ?? (m[0] >= "a" && m[0] <= "h" ? "P" : "?"));
    if (m.includes("x")) this.mm.cap++;
    if (m.includes("+")) this.mm.chk++;
    if (m.includes("#")) this.mm.mate++;
    if (m.includes("=")) this.mm.promo++;
  }

  // Keep one entry per opponent, strongest first.
  private trimBeaten() {
    const best = new Map<string, Beaten>();
    for (const b of this.beaten) { const o = best.get(b.name); if (!o || b.rating > o.rating) best.set(b.name, b); }
    this.beaten = [...best.values()].sort((a, b) => b.rating - a.rating).slice(0, 20);
  }

  finish(user: LichessUser): Stats {
    this.trimBeaten();
    const named = (g: Grouped<string>, n: number): Named[] => g.top(n).map(([name, a]) => ({ name, ...a.out() }));
    const perfs: PerfRow[] = [...STANDARD_PERFS, "variants"].filter(k => this.perf.has(k)).map(k => ({
      key: k, ...this.perf.get(k)!.out(), peak: this.peak.get(k) ?? null,
      cur: k === "variants" ? null : user.perfs?.[k]?.rating ?? null,
    }));
    const pf = user.perfs ?? {};
    const valid = this.all.n;
    const [bd, bn] = this.days.top(1)[0] ?? [];
    const [bm, bmn] = this.months.top(1)[0] ?? [];
    const pct = (c: Counter<string>): [string, number][] => {
      const tot = [...c.values()].reduce((a, b) => a + b, 0) || 1;
      return c.top(5).map(([k, v]) => [k, Math.round(v / tot * 1000) / 10] as [string, number]);
    };
    const len = (g?: Game) => g ? Math.ceil(g.mv.split(" ").length / 2) : 0;
    return {
      v: STATS_VERSION,
      user: {
        id: user.id, name: user.username, title: user.title, flag: user.profile?.flag,
        realName: user.profile?.realName, location: user.profile?.location,
        createdAt: user.createdAt, playTime: user.playTime?.total ?? 0,
        perfs: Object.fromEntries(Object.entries(pf).filter(([, p]) => p.rating != null)
          .map(([k, p]) => [k, { rating: p.rating, games: p.games, prov: p.prov }])),
      },
      generatedAt: Date.now(),
      first: this.firstAt === Infinity ? 0 : this.firstAt, last: this.lastAt,
      downloaded: this.downloaded, voided: this.voided,
      all: this.all.out(), white: this.white.out(), black: this.black.out(),
      rated: this.rated.out(), casual: this.casual.out(),
      perfs,
      moves: {
        own: this.own, plies: this.plies,
        avgLen: valid ? Math.round(this.validPlies / 2 / valid * 10) / 10 : 0,
        pieces: Object.fromEntries(this.pieces), ...this.mm,
      },
      longest: this.longest && { id: this.longest.id, len: len(this.longest), r: this.longest.r },
      quickMate: this.quick && { id: this.quick.id, len: len(this.quick) },
      ends: { W: pct(this.ends.W), L: pct(this.ends.L), D: pct(this.ends.D) },
      years: [...this.years.entries()].sort((a, b) => a[0] - b[0]).map(([year, a]) => ({ year, ...a.out() })),
      heat: this.heat,
      busiestDay: bd ? { date: bd, n: bn! } : undefined,
      activeDays: this.days.size,
      busiestMonth: bm ? { month: bm, n: bmn! } : undefined,
      openings: { white: named(this.opW, 7), black: named(this.opB, 7) },
      firstMove: pct(this.first), vsE4: pct(this.e4), vsD4: pct(this.d4),
      titled: TITLES.filter(t => (this.titled.get(t)?.n ?? 0) >= 3).map(t => ({ name: t, ...this.titled.get(t)!.out() })),
      beaten: this.beaten.slice(0, 5),
      opponents: named(this.opp, 5),
      distinctOpponents: this.opp.size,
      streaks: { win: this.bw, unbeaten: this.bu, loss: this.bl },
      accuracy: this.acc.n ? {
        n: this.acc.n, avg: Math.round(this.acc.sum / this.acc.n * 10) / 10, acpl: Math.round(this.acc.acpl / this.acc.n * 10) / 10,
        inacc: this.acc.inacc, mist: this.acc.mist, blun: this.acc.blun,
      } : undefined,
      tournaments: { games: this.tourGames, arenas: this.arenas.size, swiss: this.swiss.size },
    };
  }
}
