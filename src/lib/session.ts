import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * The GitHub session lives only in an encrypted, HTTP-only cookie, so there's
 * no session database. AES-256-GCM provides both secrecy and integrity: a
 * modified cookie fails authentication and is treated as signed out.
 */

export const SESSION_COOKIE = "wf-session";

export type Session = {
  token: string;
  login: string;
  avatarUrl: string;
  /** Epoch ms. GitHub App user tokens last 8 hours. */
  expiresAt: number;
};

let devSecret: string | undefined;

export function sessionSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }
  devSecret ??= randomBytes(32).toString("base64");
  return devSecret;
}

function keyFrom(secret: string) {
  return createHash("sha256").update(`wayfinder-session:${secret}`).digest();
}

export function sealSession(session: Session, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unsealSession(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): Session | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(
      "utf8",
    );
    const session = JSON.parse(json) as Session;
    return session.expiresAt > now ? session : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string) {
  const match = (header ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function sessionFromRequest(request: Request, secret = sessionSecret()) {
  return unsealSession(readCookie(request.headers.get("cookie"), SESSION_COOKIE), secret);
}

export function cookie(
  name: string,
  value: string,
  { maxAge, secure = process.env.NODE_ENV === "production" }: { maxAge: number; secure?: boolean },
) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
