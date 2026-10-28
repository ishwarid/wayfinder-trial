export type RepoRef = {
  owner: string;
  repo: string;
  /** Branch, tag or commit. Undefined means the default branch. */
  ref?: string;
};

export type SkipReason =
  "dependency-or-build" | "lockfile" | "binary" | "too-large" | "secret-file" | "generated";

/**
 * The readable files of one repository at one commit. Built once, then
 * shared read-only by every tool and request.
 */
export type Snapshot = {
  /** `owner/repo@sha`: content never changes for a given id. */
  id: string;
  owner: string;
  repo: string;
  sha: string;
  /** What the user asked for (branch name, tag or SHA). */
  ref: string;
  isPrivate: boolean;
  description: string | null;
  source: "github" | "sample";
  /** Path → file text, already redacted. Sorted by path. */
  files: Map<string, string>;
  totalBytes: number;
  skipped: { total: number; byReason: Partial<Record<SkipReason, number>> };
  redactions: number;
};

export class RepoTooLargeError extends Error {
  constructor(
    readonly limit: "files" | "bytes" | "download",
    readonly max: number,
  ) {
    super(`Repository exceeds the ${limit} limit (${max})`);
  }
}
