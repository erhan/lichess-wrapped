// A finished game reduced to what the statistics need, seen from the profile owner's side.
export interface Game {
  id: string;
  at: number;          // createdAt (ms)
  r: "W" | "D" | "L" | "X"; // X = aborted / never started
  c: "w" | "b";
  rated: boolean;
  perf: string;
  variant: string;
  status: string;
  tour?: string;       // "a:<arena id>" or "s:<swiss id>"
  op?: string;         // opening name
  mr?: number;         // own rating before the game
  md?: number;         // own rating change
  or?: number;         // opponent rating
  on?: string;         // opponent name
  ot?: string;         // opponent title
  acc?: number;
  acpl?: number;
  inacc?: number;
  mist?: number;
  blun?: number;
  mv: string;          // SAN moves, space separated
}

const VOID = new Set(["aborted", "noStart", "unknownFinish", "created", "started"]);

export function toGame(raw: any, userId: string): Game {
  const white = raw.players?.white ?? {};
  const black = raw.players?.black ?? {};
  const isWhite = white.user?.id === userId;
  const me = isWhite ? white : black;
  const op = isWhite ? black : white;
  const color = isWhite ? "white" : "black";
  let r: Game["r"] = raw.winner == null ? "D" : raw.winner === color ? "W" : "L";
  if (VOID.has(raw.status)) r = "X";
  const g: Game = {
    id: raw.id,
    at: raw.createdAt,
    r,
    c: isWhite ? "w" : "b",
    rated: !!raw.rated,
    perf: raw.perf ?? raw.speed,
    variant: raw.variant,
    status: raw.status,
    mv: raw.moves ?? "",
  };
  if (raw.arenaTour?.id) g.tour = "a:" + raw.arenaTour.id;
  else if (raw.swissTour?.id) g.tour = "s:" + raw.swissTour.id;
  if (raw.opening?.name) g.op = raw.opening.name;
  if (me.rating != null) g.mr = me.rating;
  if (me.ratingDiff != null) g.md = me.ratingDiff;
  if (op.rating != null) g.or = op.rating;
  if (op.user?.name) g.on = op.user.name;
  if (op.user?.title) g.ot = op.user.title;
  const a = me.analysis;
  if (a?.accuracy != null) {
    g.acc = a.accuracy; g.acpl = a.acpl; g.inacc = a.inaccuracy; g.mist = a.mistake; g.blun = a.blunder;
  }
  return g;
}
