import type { Citation } from "./citations";

export type RepoLink = { owner: string; repo: string; sha: string };

export function repoPath({ owner, repo }: Pick<RepoLink, "owner" | "repo">) {
  return `/r/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** The in-app code viewer at the pinned commit, with the lines highlighted. */
export function viewerUrl(link: RepoLink, { path, start, end }: Citation) {
  const params = new URLSearchParams({ sha: link.sha, path, from: String(start), to: String(end) });
  return `${repoPath(link)}/view?${params}#L${start}`;
}
