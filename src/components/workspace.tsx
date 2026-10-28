"use client";

import { useEffect, useRef, useState } from "react";
import { ExplorerChat } from "@/components/chat/explorer-chat";
import { TodoBoard } from "@/components/todo-board";
import type { RepoLink } from "@/lib/links";
import { viewerUrl } from "@/lib/links";
import type { Overview } from "@/lib/repo/overview";
import type { TodoItem } from "@/lib/repo/todos";

type Tab = "ask" | "todos";

export function Workspace({
  repo,
  overview,
  todos,
  isPrivate,
  githubUrl,
  demoNotice,
  signInUrl,
}: {
  repo: RepoLink;
  overview: Overview;
  todos: TodoItem[];
  isPrivate: boolean;
  githubUrl: string | null;
  demoNotice: string | null;
  signInUrl: string | null;
}) {
  const [tab, setTab] = useState<Tab>("ask");
  const overviewRef = useRef<HTMLDetailsElement>(null);

  // On small screens, start with the overview collapsed so the chat is in view.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches && overviewRef.current) {
      overviewRef.current.open = false;
    }
  }, []);
  const totalLangLines = overview.languages.reduce((sum, l) => sum + l.lines, 0) || 1;

  return (
    <div className="flex min-h-[calc(100dvh-53px)] flex-col lg:h-[calc(100dvh-53px)] lg:flex-row">
      <aside className="border-line bg-surface border-b lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="space-y-6 p-4 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-lg font-semibold break-all">{overview.name}</h1>
              {isPrivate && (
                <span className="border-line rounded border px-1.5 text-xs">Private</span>
              )}
            </div>
            {overview.description && (
              <p className="text-ink-soft mt-1 text-sm">{overview.description}</p>
            )}
            <p className="text-ink-muted mt-2 text-xs">
              Commit <span className="font-mono">{overview.commit}</span>
              {githubUrl && (
                <>
                  {", "}
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener"
                    className="underline underline-offset-4"
                  >
                    open on GitHub
                  </a>
                </>
              )}
            </p>
          </div>

          <details open ref={overviewRef}>
            <summary className="text-ink-soft cursor-pointer text-sm font-semibold lg:hidden">
              Project overview
            </summary>
            <div className="mt-4 space-y-6 lg:mt-0">
              {overview.languages.length > 0 && (
                <div>
                  <h2 className="text-ink-muted text-xs font-semibold">Languages</h2>
                  <div className="mt-2 flex h-2 gap-px overflow-hidden rounded-full" aria-hidden>
                    {overview.languages.map((l, i) => (
                      <span
                        key={l.name}
                        style={{ flexGrow: l.lines, opacity: 1 - i * 0.14 }}
                        className="bg-route"
                      />
                    ))}
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {overview.languages.slice(0, 4).map((l) => (
                      <li key={l.name} className="flex justify-between gap-2">
                        <span>{l.name}</span>
                        <span className="text-ink-muted">
                          {Math.round((l.lines / totalLangLines) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-ink-muted text-xs">Files read</dt>
                  <dd>{overview.fileCount.toLocaleString("en-AU")}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted text-xs">Lines</dt>
                  <dd>{overview.totalLines.toLocaleString("en-AU")}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted text-xs">Files skipped</dt>
                  <dd title="Dependencies, build output, lockfiles, binaries and secret files">
                    {overview.skippedFiles.toLocaleString("en-AU")}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted text-xs">Secrets redacted</dt>
                  <dd>{overview.redactedSecrets}</dd>
                </div>
              </dl>

              {overview.frameworks.length > 0 && (
                <div>
                  <h2 className="text-ink-muted text-xs font-semibold">Built with</h2>
                  <p className="mt-1 text-sm">{overview.frameworks.join(", ")}</p>
                </div>
              )}

              {overview.entryPoints.length > 0 && (
                <div>
                  <h2 className="text-ink-muted text-xs font-semibold">Start reading at</h2>
                  <ul className="mt-1 space-y-1">
                    {overview.entryPoints.slice(0, 6).map((path) => (
                      <li key={path}>
                        <a
                          href={viewerUrl(repo, { path, start: 1, end: 1 })}
                          target="_blank"
                          rel="noopener"
                          className="text-route-strong font-mono text-sm break-all underline decoration-dotted underline-offset-4"
                        >
                          {path}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </div>
      </aside>

      <div className="flex min-h-[70dvh] min-w-0 flex-1 flex-col lg:min-h-0">
        <div
          role="tablist"
          aria-label="Workspace"
          className="border-line bg-surface flex gap-1 border-b px-2 sm:px-4"
        >
          {(
            [
              ["ask", "Ask"],
              ["todos", `TODOs (${todos.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              id={`tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`panel-${value}`}
              onClick={() => setTab(value)}
              className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium ${
                tab === value
                  ? "border-route text-ink"
                  : "text-ink-muted hover:text-ink border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted, so switching tabs keeps the conversation. */}
        <div
          role="tabpanel"
          id="panel-ask"
          aria-labelledby="tab-ask"
          hidden={tab !== "ask"}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ExplorerChat repo={repo} demoNotice={demoNotice} signInUrl={signInUrl} />
        </div>
        <div
          role="tabpanel"
          id="panel-todos"
          aria-labelledby="tab-todos"
          hidden={tab !== "todos"}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <TodoBoard items={todos} repo={repo} />
        </div>
      </div>
    </div>
  );
}
