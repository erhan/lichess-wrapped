// Lichess account shape as returned by /api/user/{name}. The browser fetches it (see public/app.js):
// Lichess rate-limits the egress IP shared by all Workers, with or without an API token.
export const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;

// Account ids removed at the owner's request: their data is erased and no profile is built again.
// The list is the comma-separated REMOVED secret, so the names stay out of the public repo.
export const removedSet = (list?: string) => new Set((list ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));

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
