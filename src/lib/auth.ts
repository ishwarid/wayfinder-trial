import { randomBytes, timingSafeEqual } from "node:crypto";
import { createGitHubClient } from "@/lib/github/client";
import { cookie, readCookie, sealSession, SESSION_COOKIE, sessionSecret } from "@/lib/session";

/*
 * Sign-in with a GitHub App (not an OAuth App).
 *
 * An OAuth App can only ask for the `repo` scope to read private code, which
 * also grants write access to every repository the user can reach. A GitHub
 * App's user token is limited to the app's permissions (read-only Contents
 * and Metadata) and to the repositories the user installed it on.
 */

const STATE_COOKIE = "wf-oauth-state";
const STATE_MAX_AGE = 10 * 60;
/** GitHub App user-to-server tokens expire after 8 hours. */
const DEFAULT_TOKEN_SECONDS = 8 * 60 * 60;

export type AuthEnv = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  NODE_ENV?: string;
  SESSION_SECRET?: string;
};

export function isAuthConfigured(env: AuthEnv = process.env) {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

/** Where users grant the app access to more repositories. */
export function installUrl(env: AuthEnv = process.env) {
  return env.GITHUB_APP_SLUG
    ? `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`
    : null;
}

/** Only same-site paths, so the callback can't be used as an open redirect. */
export function safeReturnTo(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/";
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}

export function startLogin(request: Request, env: AuthEnv = process.env): Response {
  const url = new URL(request.url);
  if (!isAuthConfigured(env)) return redirect("/?auth=not-configured");

  const state = randomBytes(16).toString("hex");
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", `${url.origin}/api/auth/callback`);
  authorize.searchParams.set("state", state);

  return redirect(authorize.toString(), [
    cookie(STATE_COOKIE, `${state}|${returnTo}`, {
      maxAge: STATE_MAX_AGE,
      secure: env.NODE_ENV === "production",
    }),
  ]);
}

export async function finishLogin(
  request: Request,
  { env = process.env, fetch: fetchImpl = fetch }: { env?: AuthEnv; fetch?: typeof fetch } = {},
): Promise<Response> {
  const url = new URL(request.url);
  const clearState = cookie(STATE_COOKIE, "", { maxAge: 0, secure: env.NODE_ENV === "production" });
  const fail = (reason: string) => redirect(`/?auth=${reason}`, [clearState]);

  // The state must match the one this browser was given, or anyone could
  // send a victim a callback link that signs them in as someone else.
  const [expected, returnTo] = (
    readCookie(request.headers.get("cookie"), STATE_COOKIE) ?? ""
  ).split("|");
  const received = url.searchParams.get("state") ?? "";
  if (!expected || !sameString(expected, received)) return fail("state-mismatch");

  const code = url.searchParams.get("code");
  if (!code || !isAuthConfigured(env)) return fail("failed");

  const exchange = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  });
  const tokens = (await exchange.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!exchange.ok || !tokens.access_token) return fail("failed");

  const user = await createGitHubClient({ token: tokens.access_token, fetch: fetchImpl }).getUser();
  if (!user.ok) return fail("failed");

  const seconds = tokens.expires_in ?? DEFAULT_TOKEN_SECONDS;
  const session = sealSession(
    {
      token: tokens.access_token,
      login: user.value.login,
      avatarUrl: user.value.avatarUrl,
      expiresAt: Date.now() + seconds * 1000,
    },
    sessionSecret(env as NodeJS.ProcessEnv),
  );

  return redirect(safeReturnTo(returnTo), [
    clearState,
    cookie(SESSION_COOKIE, session, { maxAge: seconds, secure: env.NODE_ENV === "production" }),
  ]);
}

export function logout(env: AuthEnv = process.env): Response {
  return redirect("/", [
    cookie(SESSION_COOKIE, "", { maxAge: 0, secure: env.NODE_ENV === "production" }),
  ]);
}

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
