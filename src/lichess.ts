// Lichess public API. Requests without a User-Agent are answered with 404, so every call sends one.
const API = "https://lichess.org/api";
const UA = "lichess-profile (+https://lichess.erhan.dev)";

export const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;

export interface LichessUser {
  id: string;
  username: string;
  title?: string;
  flair?: string;
  patron?: boolean;
  createdAt: number;
  seenAt?: number;
  disabled?: boolean;
  tosViolation?: boolean;
  closed?: boolean;
  profile?: { flag?: string; location?: string; bio?: string; realName?: string; fideRating?: number };
  perfs?: Record<string, { games?: number; rating?: number; rd?: number; prov?: boolean; runs?: number; score?: number }>;
  playTime?: { total: number; tv: number };
  count?: { all: number; rated: number; win: number; loss: number; draw: number };
}

export class RateLimited extends Error {}

// Requests from Workers share one egress IP that Lichess rate-limits, so a personal API token is sent when configured.
const headers = (token?: string, accept?: string): Record<string, string> => ({
  "User-Agent": UA,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(accept ? { Accept: accept } : {}),
});

export async function fetchUser(name: string, token?: string): Promise<LichessUser | null> {
  const res = await fetch(`${API}/user/${encodeURIComponent(name)}`, { headers: headers(token) });
  if (res.status === 404) return null;
  if (res.status === 429) throw new RateLimited("lichess rate limit");
  if (!res.ok) throw new Error(`lichess user ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Streams finished games oldest-first, starting at `since` (ms), at most `max` games.
export async function* streamGames(name: string, since: number, max: number, token?: string): AsyncGenerator<any> {
  const q = new URLSearchParams({
    since: String(since), max: String(max), sort: "dateAsc",
    moves: "true", opening: "true", accuracy: "true", clocks: "false", evals: "false", finished: "true",
  });
  const res = await fetch(`${API}/games/user/${encodeURIComponent(name)}?${q}`, {
    headers: headers(token, "application/x-ndjson"),
  });
  if (res.status === 429) throw new RateLimited("lichess rate limit");
  if (!res.ok || !res.body) throw new Error(`lichess games ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
    if (done) break;
  }
  if (buf.trim()) yield JSON.parse(buf);
}
