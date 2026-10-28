import { createHash } from "node:crypto";
import { createGitHubClient, type GitHubError, type RepoMeta } from "@/lib/github/client";
import {
  createAccessCache,
  createSnapshotCache,
  type AccessCache,
  type SnapshotCache,
} from "./cache";
import { loadSampleSnapshot } from "./local";
import { SAMPLE_OWNER } from "./parse";
import { createSnapshotBuilder } from "./snapshot";
import { extractTarball } from "./tarball";
import { RepoTooLargeError, type RepoRef, type Snapshot } from "./types";

export type OpenError =
  GitHubError | { kind: "too-large"; limit: RepoTooLargeError["limit"]; max: number };

export type OpenResult = { ok: true; snapshot: Snapshot } | { ok: false; error: OpenError };

export type OpenDeps = {
  fetch?: typeof fetch;
  snapshots?: SnapshotCache;
  access?: AccessCache;
  /** Optional server token, used only for public repositories when signed out. */
  serverToken?: string;
};

const sharedSnapshots = createSnapshotCache();
const sharedAccess = createAccessCache();

const SHA = /^[0-9a-f]{40}$/;

/**
 * Opens a repository for the current user: checks they can read it, pins
 * the ref to a commit, and returns the snapshot (from cache if possible).
 *
 * The access check runs on every call, before the cache is consulted. The
 * cache is shared between users, so skipping the check would let anyone
 * read a private repository someone else had loaded.
 */
export async function openRepo(
  ref: RepoRef,
  userToken: string | undefined,
  deps: OpenDeps = {},
): Promise<OpenResult> {
  const snapshots = deps.snapshots ?? sharedSnapshots;
  const access = deps.access ?? sharedAccess;

  if (ref.owner === SAMPLE_OWNER) {
    const snapshot = await loadSampleSnapshot(ref.repo);
    return snapshot ? { ok: true, snapshot } : { ok: false, error: { kind: "not-found" } };
  }

  const usingServerToken = !userToken && Boolean(deps.serverToken);
  const token = userToken ?? deps.serverToken;
  const github = createGitHubClient({ token, fetch: deps.fetch });

  // 1. Can this caller read the repository?
  const accessKey = `${hashToken(token)}:${ref.owner}/${ref.repo}`.toLowerCase();
  let meta: RepoMeta | undefined = access.get(accessKey);
  if (!meta) {
    const result = await github.getRepo(ref.owner, ref.repo);
    if (!result.ok) return result;
    meta = result.value;
    // The server token is for public browsing only. If it can somehow see a
    // private repository, a signed-out visitor still must not.
    if (usingServerToken && meta.isPrivate) return { ok: false, error: { kind: "not-found" } };
    access.set(accessKey, meta);
  }

  // 2. Pin the ref to a commit.
  const wanted = ref.ref ?? meta.defaultBranch;
  let sha = SHA.test(wanted) ? wanted : undefined;
  if (!sha) {
    const resolved = await github.resolveCommit(meta.owner, meta.repo, wanted);
    if (!resolved.ok) return resolved;
    sha = resolved.value;
  }

  // 3. Snapshot, from cache or a fresh download.
  const id = `${meta.owner}/${meta.repo}@${sha}`;
  const cached = snapshots.get(id);
  if (cached) return { ok: true, snapshot: cached };

  const download = await github.downloadTarball(meta.owner, meta.repo, sha);
  if (!download.ok) return download;

  const builder = createSnapshotBuilder();
  try {
    await extractTarball(download.value, builder);
  } catch (error) {
    if (error instanceof RepoTooLargeError) {
      return { ok: false, error: { kind: "too-large", limit: error.limit, max: error.max } };
    }
    // A download that breaks partway (network, bad archive) is GitHub's
    // problem as far as the user is concerned: "try again" is the right answer.
    console.error("[repo] tarball extraction failed", error);
    return { ok: false, error: { kind: "failed", status: 0 } };
  }

  const snapshot = builder.finish({
    owner: meta.owner,
    repo: meta.repo,
    sha,
    ref: wanted,
    isPrivate: meta.isPrivate,
    description: meta.description,
    source: "github",
  });
  snapshots.set(snapshot);
  return { ok: true, snapshot };
}

function hashToken(token: string | undefined) {
  return token ? createHash("sha256").update(token).digest("hex").slice(0, 16) : "anonymous";
}
