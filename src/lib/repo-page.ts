import "server-only";

import { installUrl, isAuthConfigured } from "@/lib/auth";
import { chooseModel } from "@/lib/agent/model";
import { describeOpenError } from "@/lib/repo/errors";
import { openRepo } from "@/lib/repo/load";
import { parseRepoInput, SAMPLE_OWNER } from "@/lib/repo/parse";
import type { RepoRef } from "@/lib/repo/types";
import { getSession } from "@/lib/server-session";

/** Everything a repository page needs: who's asking, access, and the snapshot. */
export async function loadRepoForPage(
  owner: string,
  repo: string,
  ref: string | undefined,
  returnTo: string,
) {
  const session = await getSession();
  const signInUrl = isAuthConfigured()
    ? `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : null;

  const parsed: RepoRef | null =
    owner === SAMPLE_OWNER ? { owner, repo } : parseRepoInput(`${owner}/${repo}`);
  if (!parsed) {
    return {
      ok: false as const,
      session,
      view: {
        title: "That isn't a repository name",
        message: "Repository names look like owner/repo.",
      },
      signInUrl: null,
      installUrl: null,
    };
  }

  const result = await openRepo({ ...parsed, ref }, session?.token, {
    serverToken: process.env.GITHUB_TOKEN,
  });
  if (!result.ok) {
    const view = describeOpenError(result.error, { signedIn: Boolean(session) });
    const missing = result.error.kind === "not-found" || result.error.kind === "unauthorized";
    return {
      ok: false as const,
      session,
      view,
      signInUrl:
        missing && !session ? signInUrl : result.error.kind === "unauthorized" ? signInUrl : null,
      installUrl: result.error.kind === "not-found" && session ? installUrl() : null,
    };
  }

  const model = chooseModel();
  const demoNotice =
    model.provider === "demo"
      ? `Scripted demo, not AI: no AI key is set${model.warning ? ` (${model.warning})` : ""}, so answers are pieced together from the developers' comments and the code's structure. Add a free Gemini or Groq key to get real explanations of the logic.`
      : null;

  return { ok: true as const, session, snapshot: result.snapshot, signInUrl, demoNotice };
}
