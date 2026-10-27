import { DurableObject } from "cloudflare:workers";
import { toGame, type Game } from "./game";
import { fetchUser, streamGames, RateLimited, type LichessUser } from "./lichess";
import { Aggregator, type Stats } from "./stats";
import { renderOg } from "./og";
import type { Env } from "./index";

// Games per Lichess request (one alarm run) and per stored chunk row.
const PAGE = 2000;
const CHUNK = 500;
export const STALE_MS = 24 * 3600_000;
export const MIN_REFRESH_MS = 3600_000;

export type Status = "new" | "importing" | "ready" | "missing" | "closed" | "error";

export interface State {
  status: Status;
  name: string;          // as typed; replaced by the canonical username once known
  id: string;            // lowercase Lichess id
  expected: number;      // games Lichess reports for the account
  fetched: number;       // games stored so far
  cursor: number;        // createdAt of the next game to fetch
  startedAt: number;
  updatedAt: number;     // last time an import finished
  waitUntil?: number;    // set while backing off after a rate limit
  retries: number;
  error?: string;
}

export interface View { state: State; stats: Stats | null }

// One object per Lichess account. Games are kept as JSON chunks so a refresh only fetches what is new.
export class Profile extends DurableObject<Env> {
  private sql: SqlStorage;
  private inflight = 0;  // games parsed by the running import but not yet stored

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

  // Returns what is stored, starting the first import when the account has never been seen.
  async view(name: string): Promise<View> {
    let state = this.get<State>("state");
    if (!state || state.status === "missing" && Date.now() - state.startedAt > MIN_REFRESH_MS) {
      state = await this.begin(name, state);
    } else if (state.status === "ready" && Date.now() - state.updatedAt > STALE_MS) {
      state = await this.refresh(true);
    } else if (state.status === "importing") {
      // Recover an import whose alarm was lost.
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
    return { state, stats: this.get<Stats>("stats") };
  }

  async status(): Promise<State | null> {
    const state = this.get<State>("state");
    if (state?.status === "importing") state.fetched += this.inflight;
    return state;
  }

  async stats(): Promise<Stats | null> {
    return this.get<Stats>("stats");
  }

  // Fetches games played since the last import. `auto` refreshes respect the stale window instead.
  async refresh(auto = false): Promise<State> {
    const state = this.get<State>("state");
    if (!state) throw new Error("unknown profile");
    if (state.status === "error") state.retries = 0;
    else if (state.status !== "ready") return state;
    if (Date.now() - state.updatedAt < (auto ? STALE_MS : MIN_REFRESH_MS)) return state;
    const user = await fetchUser(state.id).catch(() => null);
    if (user) this.put("user", user);
    state.status = "importing";
    state.startedAt = Date.now();
    state.expected = user?.count?.all ?? state.expected;
    state.error = undefined;
    this.put("state", state);
    await this.ctx.storage.setAlarm(Date.now());
    return state;
  }

  private async begin(name: string, prev: State | null): Promise<State> {
    const now = Date.now();
    let user: LichessUser | null;
    try {
      user = await fetchUser(name);
    } catch (e) {
      return { status: "error", name, id: name.toLowerCase(), expected: 0, fetched: 0, cursor: 0, startedAt: now, updatedAt: 0, retries: 0, error: String(e) };
    }
    const state: State = {
      status: "importing", name: user?.username ?? name, id: user?.id ?? name.toLowerCase(),
      expected: user?.count?.all ?? 0, fetched: prev?.fetched ?? 0, cursor: prev?.cursor ?? 0,
      startedAt: now, updatedAt: 0, retries: 0,
    };
    if (!user) state.status = "missing";
    else if (user.disabled || user.closed || user.tosViolation) state.status = "closed";
    if (user) this.put("user", user);
    this.put("state", state);
    if (state.status === "importing") await this.ctx.storage.setAlarm(now);
    return state;
  }

  async alarm() {
    const state = this.get<State>("state");
    if (!state || state.status !== "importing") return;
    state.waitUntil = undefined;
    let batch: Game[] = [];
    const flush = () => {
      if (!batch.length) return;
      const chunk = batch;
      batch = [];
      this.inflight = 0;
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("INSERT INTO chunks (first_at, last_at, n, data) VALUES (?, ?, ?, ?)",
          chunk[0].at, chunk[chunk.length - 1].at, chunk.length, JSON.stringify(chunk));
        state.fetched += chunk.length;
        state.cursor = chunk[chunk.length - 1].at + 1;
        this.put("state", state);
      });
    };
    try {
      let n = 0;
      for await (const raw of streamGames(state.id, state.cursor, PAGE)) {
        batch.push(toGame(raw, state.id));
        this.inflight = batch.length;
        n++;
        if (batch.length >= CHUNK) flush();
      }
      flush();
      state.retries = 0;
      if (n >= PAGE) {
        this.put("state", state);
        await this.ctx.storage.setAlarm(Date.now() + 500);
        return;
      }
      await this.finish(state);
    } catch (e) {
      flush();
      if (e instanceof RateLimited) {
        // Lichess asks clients to wait a full minute after a 429.
        state.waitUntil = Date.now() + 65_000;
        this.put("state", state);
        await this.ctx.storage.setAlarm(state.waitUntil);
        return;
      }
      state.retries++;
      state.error = String(e);
      if (state.retries >= 5) state.status = state.updatedAt ? "ready" : "error";
      else await this.ctx.storage.setAlarm(Date.now() + 15_000 * state.retries);
      this.put("state", state);
    }
  }

  private async finish(state: State) {
    const user = this.get<LichessUser>("user")!;
    const agg = new Aggregator();
    for (const { data } of this.sql.exec<{ data: string }>("SELECT data FROM chunks ORDER BY seq")) {
      for (const g of JSON.parse(data) as Game[]) agg.add(g);
    }
    const stats = agg.finish(user);
    state.status = "ready";
    state.updatedAt = Date.now();
    state.error = undefined;
    this.ctx.storage.transactionSync(() => {
      this.put("stats", stats);
      this.put("state", state);
      this.sql.exec("DELETE FROM images");
    });
    const reg = this.env.REGISTRY.get(this.env.REGISTRY.idFromName("main"));
    await reg.upsert({
      id: state.id, name: user.username, title: user.title ?? null, flag: user.profile?.flag ?? null,
      games: stats.all.n, score: stats.all.s, blitz: user.perfs?.blitz?.rating ?? null, updatedAt: state.updatedAt,
    });
  }

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
