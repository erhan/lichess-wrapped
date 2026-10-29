// Sign in with Lichess (OAuth 2 with PKCE, no scopes) so people can prove which account is theirs
// before removing it, or restoring it after a removal. Unlike the game export, these endpoints
// answer requests from Workers.
const LICHESS = "https://lichess.org";
const UA = { "User-Agent": "lichess-wrapped (https://github.com/erhan/lichess-wrapped)" };
const CLIENT_ID = "lichess-wrapped";
const COOKIE = "rm";

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const callback = (url: URL) => `${url.origin}/remove/callback`;

export const clearCookie = `${COOKIE}=; Path=/remove; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export type Purpose = "remove" | "restore";

// Sends the visitor to Lichess, keeping the PKCE verifier, state and purpose in a short-lived cookie.
export async function startSignIn(url: URL, purpose: Purpose): Promise<Response> {
  const verifier = random(), state = random();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({
    response_type: "code", client_id: CLIENT_ID, redirect_uri: callback(url),
    code_challenge_method: "S256", code_challenge: challenge, state,
  });
  return new Response(null, {
    status: 302,
    headers: { location: `${LICHESS}/oauth?${q}`, "set-cookie": `${COOKIE}=${state}.${verifier}.${purpose}; Path=/remove; Max-Age=600; HttpOnly; Secure; SameSite=Lax` },
  });
}

// Returns the account that signed in, or null when the sign-in was refused or does not check out.
export async function finishSignIn(req: Request, url: URL): Promise<{ id: string; username: string; purpose: Purpose } | null> {
  const [state, verifier, purpose] = (req.headers.get("cookie")?.match(/(?:^|;\s*)rm=([^;]+)/)?.[1] ?? "").split(".");
  const code = url.searchParams.get("code");
  if (!code || !state || !verifier || state !== url.searchParams.get("state") || (purpose !== "remove" && purpose !== "restore")) return null;
  const token = await fetch(`${LICHESS}/api/token`, {
    method: "POST", headers: UA,
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: callback(url), client_id: CLIENT_ID }),
  });
  if (!token.ok) return null;
  const { access_token } = await token.json<{ access_token: string }>();
  const auth = { ...UA, Authorization: `Bearer ${access_token}` };
  const account = await fetch(`${LICHESS}/api/account`, { headers: auth });
  // The token is only needed for this one question.
  await fetch(`${LICHESS}/api/token`, { method: "DELETE", headers: auth }).catch(() => {});
  if (!account.ok) return null;
  const { id, username } = await account.json<{ id?: string; username?: string }>();
  return typeof id === "string" && typeof username === "string" ? { id, username, purpose } : null;
}
