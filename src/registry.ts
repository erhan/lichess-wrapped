import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

export interface Entry {
  id: string; name: string; title: string | null; flag: string | null;
  games: number; score: number; blitz: number | null; updatedAt: number;
}

// Single object listing every generated profile for the home page.
export class Registry extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT, flag TEXT,
      games INTEGER NOT NULL, score REAL NOT NULL, blitz INTEGER, updated_at INTEGER NOT NULL)`);
  }

  async upsert(e: Entry) {
    this.sql.exec(`INSERT INTO profiles (id, name, title, flag, games, score, blitz, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, title = excluded.title, flag = excluded.flag,
      games = excluded.games, score = excluded.score, blitz = excluded.blitz, updated_at = excluded.updated_at`,
      e.id, e.name, e.title, e.flag, e.games, e.score, e.blitz, e.updatedAt);
  }

  async recent(limit = 12): Promise<{ total: number; recent: Entry[] }> {
    const total = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM profiles").one().n;
    const recent = this.sql.exec<any>("SELECT * FROM profiles ORDER BY updated_at DESC LIMIT ?", limit).toArray()
      .map(r => ({ id: r.id, name: r.name, title: r.title, flag: r.flag, games: r.games, score: r.score, blitz: r.blitz, updatedAt: r.updated_at }));
    return { total, recent };
  }
}
