import type { Stats, Rec, Named } from "./stats";

// A few numbers from each profile, kept in the registry so the home page can add them up
// without opening every profile.
export interface Digest {
  all: Rec; white: Rec; black: Rec;
  own: number; mate: number; hours: number;
  rating: { key: string; r: number } | null;
  streak: number;
  acc: { avg: number; n: number } | null;
  scalp: { name: string; title?: string; rating: number; id: string } | null;
  openings: Named[];
  blocks: number[];
}

export interface Row { name: string; title: string | null; value: number; note?: string; title2?: string; link?: string }

export interface Community {
  profiles: number;
  all: Rec; white: Rec; black: Rec;
  own: number; mate: number; hours: number;
  blocks: number[];
  openings: Named[];
  boards: { games: Row[]; rating: Row[]; streak: Row[]; hours: Row[]; acc: Row[]; scalp: Row[] };
}

const RATED = ["bullet", "blitz", "rapid", "classical"];
export const MIN_ACC_GAMES = 20;

export function digest(s: Stats): Digest {
  let rating: Digest["rating"] = null;
  for (const k of RATED) {
    const p = s.user.perfs[k];
    if (p?.rating && !p.prov && (p.games ?? 0) >= 20 && p.rating > (rating?.r ?? 0)) rating = { key: k, r: p.rating };
  }
  const b = s.beaten[0];
  return {
    all: s.all, white: s.white, black: s.black,
    own: s.moves.own, mate: s.moves.mate, hours: Math.round(s.user.playTime / 3600),
    rating, streak: s.streaks.win,
    acc: s.accuracy ? { avg: s.accuracy.avg, n: s.accuracy.n } : null,
    scalp: b ? { name: b.name, title: b.title, rating: b.rating, id: b.id } : null,
    openings: [...s.openings.white, ...s.openings.black],
    blocks: s.blocks,
  };
}

const rec = (W: number, D: number, L: number): Rec => {
  const n = W + D + L;
  return { n, W, D, L, s: n ? Math.round((W + D / 2) / n * 1000) / 10 : 0 };
};
const sum = (rs: Rec[]) => rec(rs.reduce((a, r) => a + r.W, 0), rs.reduce((a, r) => a + r.D, 0), rs.reduce((a, r) => a + r.L, 0));

export function combine(list: { name: string; title: string | null; d: Digest }[]): Community {
  const blocks = new Array<number>(8).fill(0);
  const ops = new Map<string, [number, number, number]>();
  for (const { d } of list) {
    (d.blocks ?? []).forEach((v, i) => { blocks[i] += v; });
    for (const o of d.openings) {
      const a = ops.get(o.name) ?? [0, 0, 0];
      a[0] += o.W; a[1] += o.D; a[2] += o.L;
      ops.set(o.name, a);
    }
  }
  const top = (pick: (d: Digest) => number | null | undefined, note?: (d: Digest) => Partial<Row>, n = 5): Row[] =>
    list.map(e => ({ e, v: pick(e.d) })).filter((x): x is { e: typeof list[0]; v: number } => x.v != null && x.v > 0)
      .sort((a, b) => b.v - a.v).slice(0, n)
      .map(({ e, v }) => ({ name: e.name, title: e.title, value: v, ...note?.(e.d) }));
  return {
    profiles: list.length,
    all: sum(list.map(e => e.d.all)), white: sum(list.map(e => e.d.white)), black: sum(list.map(e => e.d.black)),
    own: list.reduce((a, e) => a + e.d.own, 0),
    mate: list.reduce((a, e) => a + e.d.mate, 0),
    hours: list.reduce((a, e) => a + e.d.hours, 0),
    blocks,
    openings: [...ops.entries()].map(([name, [W, D, L]]) => ({ name, ...rec(W, D, L) })).sort((a, b) => b.n - a.n).slice(0, 8),
    boards: {
      games: top(d => d.all.n),
      rating: top(d => d.rating?.r, d => ({ note: d.rating!.key })),
      streak: top(d => d.streak),
      hours: top(d => d.hours),
      acc: top(d => d.acc && d.acc.n >= MIN_ACC_GAMES ? d.acc.avg : null, d => ({ note: String(d.acc!.n) })),
      scalp: top(d => d.scalp?.rating, d => ({ note: d.scalp!.name, title2: d.scalp!.title, link: d.scalp!.id })),
    },
  };
}
