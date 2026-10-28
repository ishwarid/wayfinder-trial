import type { Metadata } from "next";
import Link from "next/link";
import { OpenErrorView } from "@/components/open-error";
import { githubLineUrl } from "@/lib/citations";
import { repoPath } from "@/lib/links";
import { loadRepoForPage } from "@/lib/repo-page";

type Props = {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ sha?: string; path?: string; from?: string; to?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: (await searchParams).path ?? "File" };
}

/** Read-only code view at a pinned commit, with the cited lines highlighted. */
export default async function ViewPage({ params, searchParams }: Props) {
  const [{ owner: rawOwner, repo: rawRepo }, query] = await Promise.all([params, searchParams]);
  const owner = decodeURIComponent(rawOwner);
  const repo = decodeURIComponent(rawRepo);
  const sha = /^[0-9a-f]{40}$/.test(query.sha ?? "") ? query.sha : undefined;
  const path = query.path ?? "";

  const loaded = await loadRepoForPage(
    owner,
    repo,
    sha,
    `${repoPath({ owner, repo })}/view?${new URLSearchParams(query as Record<string, string>)}`,
  );
  if (!loaded.ok)
    return (
      <OpenErrorView {...loaded.view} signInUrl={loaded.signInUrl} installUrl={loaded.installUrl} />
    );

  const content = loaded.snapshot.files.get(path);
  if (content === undefined) {
    return (
      <OpenErrorView
        title="File not available"
        message={`${path || "That file"} isn't in this repository, or it was skipped (dependency, binary, lockfile or secret file).`}
        signInUrl={null}
        installUrl={null}
      />
    );
  }

  const lines = content.split("\n");
  const from = Math.max(1, Number(query.from) || 1);
  const to = Math.max(from, Number(query.to) || from);
  const { snapshot } = loaded;

  return (
    <main id="main" className="min-h-dvh">
      <header className="border-line bg-surface sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <Link
            href={repoPath(snapshot)}
            className="text-ink-muted font-mono text-sm hover:underline"
          >
            {snapshot.owner}/{snapshot.repo}
          </Link>
          <h1 className="font-mono text-sm font-semibold break-all">{path}</h1>
        </div>
        <p className="text-ink-muted text-sm">
          Commit <span className="font-mono">{snapshot.sha.slice(0, 7)}</span>
          {snapshot.source === "github" && (
            <>
              {", "}
              <a
                href={githubLineUrl(snapshot, { path, start: from, end: to })}
                className="underline underline-offset-4"
              >
                open on GitHub
              </a>
            </>
          )}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full font-mono text-[13px] leading-6 [font-variant-ligatures:none]">
          <tbody>
            {lines.map((text, i) => {
              const n = i + 1;
              const marked = n >= from && n <= to;
              return (
                <tr key={n} id={`L${n}`} className={marked ? "bg-mark" : undefined}>
                  <td className="text-ink-muted w-px pr-4 pl-4 text-right align-top select-none sm:pl-6">
                    {n}
                  </td>
                  <td className="pr-6 whitespace-pre">{text || " "}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
