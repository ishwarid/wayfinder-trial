import type { RepoMeta } from "@/lib/github/client";
import type { Snapshot } from "./types";

/**
 * Snapshots keyed by `owner/repo@sha`. Content for a commit never changes,
 * so entries never go stale; they're only evicted for space.
 *
 * Sharing this cache between users is safe ONLY because every request
 * re-checks access before reading from it (see load.ts).
 */
export function createSnapshotCache({ maxEntries = 6, maxBytes = 200 * 1024 * 1024 } = {}) {
  const entries = new Map<string, Snapshot>();
  let bytes = 0;

  return {
    get(id: string) {
      const hit = entries.get(id);
      if (hit) {
        // Re-insert so it becomes most recently used.
        entries.delete(id);
        entries.set(id, hit);
      }
      return hit;
    },
    set(snapshot: Snapshot) {
      if (entries.has(snapshot.id)) return;
      entries.set(snapshot.id, snapshot);
      bytes += snapshot.totalBytes;
      while (entries.size > maxEntries || (bytes > maxBytes && entries.size > 1)) {
        const [oldestId, oldest] = entries.entries().next().value!;
        entries.delete(oldestId);
        bytes -= oldest.totalBytes;
      }
    },
    get size() {
      return entries.size;
    },
  };
}

export type SnapshotCache = ReturnType<typeof createSnapshotCache>;

/**
 * Remembers successful access checks briefly, keyed by who asked (a hash of
 * their token) and which repository. Only successes are cached, so a user who
 * has just installed the app on a repository isn't refused for minutes.
 */
export function createAccessCache({ ttlMs = 5 * 60 * 1000, maxEntries = 2_000 } = {}) {
  const entries = new Map<string, { meta: RepoMeta; expires: number }>();

  return {
    get(key: string, now = Date.now()) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expires <= now) {
        entries.delete(key);
        return undefined;
      }
      return hit.meta;
    },
    set(key: string, meta: RepoMeta, now = Date.now()) {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
      entries.set(key, { meta, expires: now + ttlMs });
    },
  };
}

export type AccessCache = ReturnType<typeof createAccessCache>;
