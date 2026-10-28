import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import type { Stats } from "./stats";
import { combine, digest, type Community, type Digest } from "./community";

export interface Entry {
  id: string; name: string; title: string | null; flag: string | null;
  games: number; score: number; blitz: number | null; updatedAt: number;
}

export interface Home { total: number; recent: Entry[]; community: Community | null }

const BACKFILL = 10;  // profiles from before digests existed, filled in a few at a time

// Single object listing every generated profile for the home page.
export class Registry extends DurableObject<Env> {
  private sql: SqlStorage;
  private community?: Community | null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT, flag TEXT,
      games INTEGER NOT NULL, score REAL NOT NULL, blitz INTEGER, updated_at INTEGER NOT NULL)`);
    const cols = this.sql.exec<{ name: string }>("PRAGMA table_info(profiles)").toArray().map(c => c.name);
    if (!cols.includes("digest")) this.sql.exec("ALTER TABLE profiles ADD COLUMN digest TEXT");
  }

  async upsert(e: Entry, d?: Digest) {
    this.sql.exec(`INSERT INTO profiles (id, name, title, flag, games, score, blitz, updated_at, digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, title = excluded.title, flag = excluded.flag,
      games = excluded.games, score = excluded.score, blitz = excluded.blitz, updated_at = excluded.updated_at,
      digest = coalesce(excluded.digest, profiles.digest)`,
      e.id, e.name, e.title, e.flag, e.games, e.score, e.blitz, e.updatedAt, d ? JSON.stringify(d) : null);
    this.community = undefined;
  }

  async recent(limit = 12): Promise<{ total: number; recent: Entry[] }> {
    const total = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM profiles").one().n;
    const recent = this.sql.exec<any>("SELECT * FROM profiles ORDER BY updated_at DESC LIMIT ?", limit).toArray()
      .map(r => ({ id: r.id, name: r.name, title: r.title, flag: r.flag, games: r.games, score: r.score, blitz: r.blitz, updatedAt: r.updated_at }));
    return { total, recent };
  }

  async all(): Promise<{ name: string; updatedAt: number }[]> {
    return this.sql.exec<{ name: string; updated_at: number }>("SELECT name, updated_at FROM profiles ORDER BY updated_at DESC").toArray()
      .map(r => ({ name: r.name, updatedAt: r.updated_at }));
  }

  async home(limit = 12): Promise<Home> {
    if (this.community === undefined) {
      const pending = await this.backfill();
      const rows = this.sql.exec<{ name: string; title: string | null; digest: string }>(
        "SELECT name, title, digest FROM profiles WHERE digest IS NOT NULL").toArray();
      const community = rows.length >= 2 ? combine(rows.map(r => ({ name: r.name, title: r.title, d: JSON.parse(r.digest) }))) : null;
      // Kept until the next upsert, once every profile has a digest.
      if (!pending) this.community = community;
      return { ...(await this.recent(limit)), community };
    }
    return { ...(await this.recent(limit)), community: this.community };
  }

  // Returns how many profiles still have no digest.
  private async backfill() {
    const ids = this.sql.exec<{ id: string }>("SELECT id FROM profiles WHERE digest IS NULL LIMIT ?", BACKFILL).toArray();
    await Promise.all(ids.map(async ({ id }) => {
      const s = await this.env.PROFILE.get(this.env.PROFILE.idFromName(id)).stats().catch(() => null) as Stats | null;
      if (s) this.sql.exec("UPDATE profiles SET digest = ? WHERE id = ?", JSON.stringify(digest(s)), id);
    }));
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM profiles WHERE digest IS NULL").one().n;
  }
}
