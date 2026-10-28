import type { RepoRef } from "./types";

// GitHub's own rules: owners are alphanumeric with single hyphens (max 39);
// repository names allow letters, digits, ".", "-" and "_".
const OWNER = /^(?!-)[A-Za-z0-9-]{1,39}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Accepts `owner/repo`, `github.com/owner/repo`, full URLs, `.git` clone
 * URLs, and links to a branch, file or commit inside a repository.
 * Returns null for anything else.
 */
export function parseRepoInput(input: string): RepoRef | null {
  let text = input.trim();
  if (!text) return null;

  text = text
    .replace(/^git@github\.com:/i, "")
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");

  const [owner, rawRepo, kind, ...rest] = text.split("/");
  if (!owner || !rawRepo) return null;

  const repo = rawRepo.replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !NAME.test(repo) || repo === "." || repo === "..") return null;

  // /tree/<ref>/..., /blob/<ref>/..., /commit/<sha>
  // Branch names with slashes are ambiguous in URLs; we take the first
  // segment, which covers the common case.
  if ((kind === "tree" || kind === "blob" || kind === "commit") && rest[0]) {
    return { owner, repo, ref: decodeURIComponent(rest[0]) };
  }
  // Any other GitHub page (issues, pulls, actions...) still identifies the repo.
  return { owner, repo };
}

export function formatRepo({ owner, repo }: Pick<RepoRef, "owner" | "repo">) {
  return `${owner}/${repo}`;
}

export const SAMPLE_OWNER = "_sample";
