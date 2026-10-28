import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { SAMPLE_OWNER } from "./parse";
import { createSnapshotBuilder } from "./snapshot";
import type { Snapshot } from "./types";

/**
 * Loads a repository from a folder on disk, through the same filters and
 * redaction as a GitHub download. Used for the built-in sample repository,
 * tests and evals, so none of them need the network.
 */
export async function loadLocalSnapshot(
  dir: string,
  meta: { owner: string; repo: string; description: string | null },
): Promise<Snapshot> {
  const builder = createSnapshotBuilder();

  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const path = relative(dir, full).split(sep).join("/");
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const { size } = await stat(full);
        if (builder.accepts(path, size)) builder.add(path, await readFile(full));
      }
    }
  }
  await walk(dir);

  return builder.finish({
    ...meta,
    sha: "0000000000000000000000000000000000000000",
    ref: "main",
    isPrivate: false,
    source: "sample",
  });
}

export const SAMPLE_REPOS: Record<string, { dir: string; description: string }> = {
  "tiny-shop": {
    dir: "evals/fixtures/tiny-shop",
    description: "A small online store API: products, cart, discounts and checkout.",
  },
};

const sampleCache = new Map<string, Promise<Snapshot>>();

export function loadSampleSnapshot(name: string): Promise<Snapshot> | null {
  const sample = SAMPLE_REPOS[name];
  if (!sample) return null;
  let pending = sampleCache.get(name);
  if (!pending) {
    // The folder is listed in next.config's outputFileTracingIncludes, so
    // tell Turbopack not to trace this dynamic path (it would include everything).
    pending = loadLocalSnapshot(join(/* turbopackIgnore: true */ process.cwd(), sample.dir), {
      owner: SAMPLE_OWNER,
      repo: name,
      description: sample.description,
    });
    sampleCache.set(name, pending);
  }
  return pending;
}
