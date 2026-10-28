import type { Metadata } from "next";
import { Suspense } from "react";
import { OpenErrorView } from "@/components/open-error";
import { SiteHeader } from "@/components/site-header";
import { Workspace } from "@/components/workspace";
import { isAuthConfigured } from "@/lib/auth";
import { repoPath } from "@/lib/links";
import { loadRepoForPage } from "@/lib/repo-page";
import { buildOverview } from "@/lib/repo/overview";
import { findTodos } from "@/lib/repo/todos";
import { getSession } from "@/lib/server-session";

type Props = {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}` };
}

export default async function RepoPage({ params, searchParams }: Props) {
  const [{ owner: rawOwner, repo: rawRepo }, { ref }, session] = await Promise.all([
    params,
    searchParams,
    getSession(),
  ]);
  const owner = decodeURIComponent(rawOwner);
  const repo = decodeURIComponent(rawRepo);
  const returnTo = `${repoPath({ owner, repo })}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;

  return (
    <>
      <SiteHeader session={session} authConfigured={isAuthConfigured()} returnTo={returnTo} wide />
      <Suspense fallback={<Loading name={`${owner}/${repo}`} />}>
        <RepoWorkspace owner={owner} repo={repo} gitRef={ref} returnTo={returnTo} />
      </Suspense>
    </>
  );
}

async function RepoWorkspace({
  owner,
  repo,
  gitRef,
  returnTo,
}: {
  owner: string;
  repo: string;
  gitRef?: string;
  returnTo: string;
}) {
  const loaded = await loadRepoForPage(owner, repo, gitRef, returnTo);
  if (!loaded.ok) {
    return (
      <OpenErrorView {...loaded.view} signInUrl={loaded.signInUrl} installUrl={loaded.installUrl} />
    );
  }

  const { snapshot } = loaded;
  const link = { owner: snapshot.owner, repo: snapshot.repo, sha: snapshot.sha };
  return (
    <main id="main">
      <Workspace
        repo={link}
        overview={buildOverview(snapshot)}
        todos={findTodos(snapshot)}
        isPrivate={snapshot.isPrivate}
        githubUrl={
          snapshot.source === "github"
            ? `https://github.com/${snapshot.owner}/${snapshot.repo}/tree/${snapshot.sha}`
            : null
        }
        demoNotice={loaded.demoNotice}
        signInUrl={loaded.signInUrl}
      />
    </main>
  );
}

function Loading({ name }: { name: string }) {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-20 sm:px-6" aria-busy="true">
      <p className="text-ink-muted flex items-center gap-2">
        <span aria-hidden className="working-dot bg-route size-2 rounded-full" />
        Downloading and reading <span className="text-ink font-mono">{name}</span>
      </p>
      <p className="text-ink-muted mt-2 text-sm">
        Large repositories can take a few seconds. Dependencies, binaries and secrets are skipped.
      </p>
    </main>
  );
}
