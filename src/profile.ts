import { DurableObject } from "cloudflare:workers";
import { toGame, type Game } from "./game";
import type { LichessUser } from "./lichess";
import { Aggregator, type Stats } from "./stats";
import { renderOg } from "./og";
import type { Env } from "./index";

export const STALE_MS = 24 * 3600_000;
export const MIN_REFRESH_MS = 3600_000;
export const MAX_BATCH = 1000;

export type Status = "importing" | "ready" | "missing" | "closed";

export interface State {
  status: Status;
  name: string;          // as typed; replaced by the canonical username once known
  id: string;            // lowercase Lichess id
  expected: number;      // games Lichess reports for the account
  fetched: number;       // games stored so far
  cursor: number;        // createdAt of the next game to fetch
  startedAt: number;
  updatedAt: number;     // last time an import finished
  needUser: boolean;     // account details must be sent before games
}

export interface View { state: State; stats: Stats | null }

export interface Ingest {
  since: number;         // must equal the stored cursor, so two clients cannot interleave
  user?: LichessUser;
  missing?: boolean;
  games?: any[];         // raw Lichess NDJSON objects, oldest first
  done?: boolean;
}

export type IngestResult = { ok: true; state: State } | { ok: false; code: number; error: string; state: State | null };

class IngestError extends Error {
  constructor(msg: string, readonly code = 400) { super(msg); }
}

// One object per Lichess account. Lichess rate-limits the shared Workers egress IP, so the
// visitor's browser downloads the games and posts them here in order; games are kept as JSON
// chunks and a refresh only appends what was played after the cursor.
export class Profile extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks (seq INTEGER PRIMARY KEY AUTOINCREMENT, first_at INTEGER, last_at INTEGER, n INTEGER, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS images (k TEXT PRIMARY KEY, png BLOB NOT NULL);`);
  }

  private get<T>(k: string): T | null {
    const row = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = ?", k).toArray()[0];
    return row ? JSON.parse(row.v) : null;
  }

  private put(k: string, v: unknown) {
    this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, JSON.stringify(v));
  }

  // Returns what is stored, opening an import when the account is new or its profile is stale.
  async view(name: string): Promise<View> {
    let state = this.get<State>("state");
    const stale = state && Date.now() - (state.status === "missing" ? state.startedAt : state.updatedAt) > (state.status === "missing" ? MIN_REFRESH_MS : STALE_MS);
    if (!state || state.status !== "importing" && stale) {
      state = {
        status: "importing", name: state?.name ?? name, id: name.toLowerCase(), needUser: true,
        expected: state?.expected ?? 0, fetched: state?.fetched ?? 0, cursor: state?.cursor ?? 0,
        startedAt: Date.now(), updatedAt: state?.updatedAt ?? 0,
      };
      this.put("state", state);
    }
    return { state, stats: this.get<Stats>("stats") };
  }

  async status(): Promise<State | null> {
    return this.get<State>("state");
  }

  async stats(): Promise<Stats | null> {
    return this.get<Stats>("stats");
  }

  // Opens an import for games played since the last one, at most once an hour.
  async refresh(): Promise<State | null> {
    const state = this.get<State>("state");
    if (!state || state.status !== "ready" || Date.now() - state.updatedAt < MIN_REFRESH_MS) return state;
    state.status = "importing";
    state.needUser = true;
    state.startedAt = Date.now();
    this.put("state", state);
    return state;
  }

  async ingest(req: Ingest): Promise<IngestResult> {
    try {
      return { ok: true, state: await this.apply(req) };
    } catch (e) {
      if (!(e instanceof IngestError)) throw e;
      return { ok: false, code: e.code, error: e.message, state: this.get<State>("state") };
    }
  }

  private async apply(req: Ingest): Promise<State> {
    const state = this.get<State>("state");
    if (!state || state.status !== "importing") throw new IngestError("no import in progress", 409);
    if (req.since !== state.cursor) throw new IngestError("cursor moved", 409);

    if (req.missing) {
      if (this.get<Stats>("stats")) throw new IngestError("profile exists");
      state.status = "missing";
      state.needUser = false;
      this.put("state", state);
      return state;
    }

    if (req.user) {
      const u = req.user;
      if (typeof u !== "object" || u.id !== state.id || u.username?.toLowerCase() !== state.id) throw new IngestError("wrong user");
      this.put("user", u);
      state.name = u.username;
      state.expected = u.count?.all ?? state.expected;
      state.needUser = false;
      if (u.disabled || u.closed || u.tosViolation) state.status = "closed";
    }
    if (state.needUser) throw new IngestError("user required");

    const games = req.games ?? [];
    if (games.length > MAX_BATCH) throw new IngestError("batch too large");
    if (games.length) {
      const now = Date.now();
      let prev = state.cursor;
      const chunk: Game[] = games.map(raw => {
        if (!raw || typeof raw.id !== "string" || !/^[A-Za-z0-9]{8}$/.test(raw.id)) throw new IngestError("bad game");
        if (typeof raw.createdAt !== "number" || raw.createdAt < prev || raw.createdAt > now + 300_000) throw new IngestError("bad game time");
        const p = raw.players;
        if (p?.white?.user?.id !== state.id && p?.black?.user?.id !== state.id) throw new IngestError("game without user");
        prev = raw.createdAt;
        return toGame(raw, state.id);
      });
      this.sql.exec("INSERT INTO chunks (first_at, last_at, n, data) VALUES (?, ?, ?, ?)",
        chunk[0].at, chunk[chunk.length - 1].at, chunk.length, JSON.stringify(chunk));
      state.fetched += chunk.length;
      state.cursor = chunk[chunk.length - 1].at + 1;
    }

    if (req.done && state.status === "importing") await this.finish(state);
    else this.put("state", state);
    return state;
  }

  private async finish(state: State) {
    const user = this.get<LichessUser>("user");
    if (!user) throw new IngestError("user required");
    const agg = new Aggregator();
    for (const { data } of this.sql.exec<{ data: string }>("SELECT data FROM chunks ORDER BY seq")) {
      for (const g of JSON.parse(data) as Game[]) agg.add(g);
    }
    const stats = agg.finish(user);
    state.status = "ready";
    state.updatedAt = Date.now();
    this.put("stats", stats);
    this.put("state", state);
    this.sql.exec("DELETE FROM images");
    const reg = this.env.REGISTRY.get(this.env.REGISTRY.idFromName("main"));
    await reg.upsert({
      id: state.id, name: user.username, title: user.title ?? null, flag: user.profile?.flag ?? null,
      games: stats.all.n, score: stats.all.s, blitz: user.perfs?.blitz?.rating ?? null, updatedAt: state.updatedAt,
    });
  }

  // Nothing is scheduled any more; this absorbs alarms left by the earlier server-side importer.
  async alarm() {}

  // Share card for link previews, rendered once per stats version.
  async og(): Promise<ArrayBuffer | null> {
    const stats = this.get<Stats>("stats");
    if (!stats) return null;
    const key = String(stats.generatedAt);
    const row = this.sql.exec<{ png: ArrayBuffer }>("SELECT png FROM images WHERE k = ?", key).toArray()[0];
    if (row) return row.png;
    const png = await renderOg(stats);
    this.sql.exec("INSERT OR REPLACE INTO images (k, png) VALUES (?, ?)", key, png);
    return png;
  }
}
