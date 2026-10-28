import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionSecret, unsealSession } from "./session";

/** The signed-in user in a Server Component, or null. */
export async function getSession() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return unsealSession(value, sessionSecret());
}
