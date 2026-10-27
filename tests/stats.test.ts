import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { toGame } from "../src/game.ts";
import { Aggregator } from "../src/stats.ts";

const user = { id: "me", username: "Me", createdAt: 0, perfs: { blitz: { rating: 2000 } }, playTime: { total: 3600, tv: 0 } };
const raw = (o: any) => ({
  id: o.id, rated: true, variant: "standard", speed: "blitz", perf: "blitz", createdAt: o.at, lastMoveAt: o.at + 1,
  status: o.status ?? "resign", source: "pool", winner: o.winner,
  players: {
    white: { user: { id: o.white ?? "me", name: o.white ?? "Me" }, rating: 2000, ratingDiff: 5 },
    black: { user: { id: o.black ?? "opp", name: o.black ?? "Opp", title: "FM" }, rating: 2100, ratingDiff: -5 },
  },
  opening: { eco: "A04", name: "Zukertort Opening: Quiet System" },
  moves: o.moves ?? "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4",
});

test("results are counted from the owner's side", () => {
  const agg = new Aggregator();
  agg.add(toGame(raw({ id: "a", at: 1, winner: "white" }), "me"));
  agg.add(toGame(raw({ id: "b", at: 2, winner: "black", white: "opp", black: "me" }), "me"));
  agg.add(toGame(raw({ id: "c", at: 3, winner: "white", white: "opp", black: "me" }), "me"));
  agg.add(toGame(raw({ id: "d", at: 4, status: "aborted" }), "me"));
  const s = agg.finish(user as any);
  assert.deepEqual([s.all.n, s.all.W, s.all.L, s.voided], [3, 2, 1, 1]);
  assert.equal(s.white.n, 1);
  assert.equal(s.streaks.win, 2);
  assert.equal(s.openings.white[0].name, "Zukertort Opening");
  assert.equal(s.moves.short, 2); // move counts include aborted games, as in the export totals
  assert.equal(s.firstMove[0][0], "Nf3");
});

// Optional check against a real export: LICHESS_NDJSON=path LICHESS_ID=user npm test
const file = process.env.LICHESS_NDJSON;
test("real export", { skip: !file || !existsSync(file) }, () => {
  const agg = new Aggregator();
  const games = readFileSync(file!, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).reverse();
  for (const g of games) agg.add(toGame(g, process.env.LICHESS_ID!));
  const s = agg.finish(user as any);
  console.log(JSON.stringify({ all: s.all, own: s.moves.own, streaks: s.streaks, acc: s.accuracy }));
  assert.ok(s.all.n > 0);
});
