import Link from "next/link";
import { RepoInput } from "@/components/repo-input";
import { SiteHeader } from "@/components/site-header";
import { isAuthConfigured } from "@/lib/auth";
import { getSession } from "@/lib/server-session";

const AUTH_MESSAGES: Record<string, string> = {
  "not-configured":
    "GitHub sign-in isn't set up on this deployment, so only public repositories work.",
  "state-mismatch":
    "Sign-in didn't complete because the request couldn't be verified. Try signing in again.",
  failed: "GitHub sign-in didn't complete. Try again.",
};

type Props = { searchParams: Promise<{ auth?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const [{ auth }, session] = await Promise.all([searchParams, getSession()]);
  const authMessage = auth ? AUTH_MESSAGES[auth] : undefined;

  return (
    <>
      <SiteHeader session={session} authConfigured={isAuthConfigured()} />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6 sm:pt-24">
        {authMessage && (
          <p
            role="status"
            className="border-check-line bg-check-bg text-check-ink mb-10 max-w-2xl rounded-lg border px-4 py-3 text-sm"
          >
            {authMessage}
          </p>
        )}

        <h1 className="max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight sm:text-6xl">
          Ask any codebase how it works.
        </h1>
        <p className="text-ink-soft mt-5 max-w-2xl text-lg leading-relaxed">
          Paste a GitHub repository and ask about its business logic, its flows or its unfinished
          work. Wayfinder reads the code and links every answer to the lines behind it.
        </p>

        <div className="mt-10">
          <RepoInput />
          <p className="text-ink-muted mt-4 text-sm">
            No repository in mind?{" "}
            <Link
              href="/r/_sample/tiny-shop"
              className="text-route-strong font-medium underline underline-offset-4"
            >
              Try the sample store API
            </Link>
            {session ? null : ". Sign in to open private repositories."}
          </p>
        </div>

        <dl className="mt-20 grid max-w-4xl gap-x-10 gap-y-6 sm:grid-cols-3">
          <div>
            <dt className="font-semibold">Read-only</dt>
            <dd className="text-ink-soft mt-1 text-sm leading-relaxed">
              The code is downloaded and read, never run. Private access is limited to the
              repositories you choose.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Answers you can check</dt>
            <dd className="text-ink-soft mt-1 text-sm leading-relaxed">
              Citations to lines the agent actually read are marked verified. Anything else is
              flagged.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Secrets stay out</dt>
            <dd className="text-ink-soft mt-1 text-sm leading-relaxed">
              Environment files and key-shaped values are removed before the AI sees anything.
            </dd>
          </div>
        </dl>
      </main>
    </>
  );
}
