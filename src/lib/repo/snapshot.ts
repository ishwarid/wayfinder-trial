import { redactSecrets } from "./redact";
import { RepoTooLargeError, type SkipReason, type Snapshot } from "./types";

export const LIMITS = {
  maxFileBytes: 512 * 1024,
  maxFiles: 5_000,
  maxTotalBytes: 40 * 1024 * 1024,
  maxDownloadBytes: 150 * 1024 * 1024,
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  "coverage",
  "vendor",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".gradle",
  ".terraform",
  "Pods",
  "DerivedData",
]);

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
]);

const BINARY_EXTENSIONS = new Set(
  (
    "png jpg jpeg gif webp avif ico bmp tif tiff psd ai sketch fig pdf zip gz tgz tar rar 7z jar war " +
    "woff woff2 ttf otf eot mp3 mp4 m4a mov avi mkv webm wav ogg flac exe dll so dylib class o a " +
    "pyc wasm bin dat db sqlite sqlite3 parquet onnx pt pth h5 keystore jks p12 pfx"
  ).split(" "),
);

const SECRET_FILE = /(^|\/)(\.env(\.[^/]*)?|id_(rsa|dsa|ecdsa|ed25519)|.*\.(pem|key|p12|pfx))$/i;
// Committed on purpose, with placeholder values. Kept, but still redacted.
const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template|dist)$/i;
const GENERATED = /(\.min\.(js|css)|\.map|\.snap)$/i;

/** Decides from the path alone, before reading content. */
export function skipReasonForPath(path: string): SkipReason | null {
  const parts = path.split("/");
  if (parts.slice(0, -1).some((dir) => SKIP_DIRS.has(dir))) return "dependency-or-build";
  const name = parts.at(-1) ?? "";
  if (LOCKFILES.has(name)) return "lockfile";
  if (SECRET_FILE.test(path) && !ENV_TEMPLATE.test(path)) return "secret-file";
  if (GENERATED.test(name)) return "generated";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  return null;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** Text if the bytes are valid UTF-8 without NUL bytes, otherwise null. */
export function decodeText(bytes: Uint8Array): string | null {
  const head = bytes.subarray(0, 8_000);
  if (head.includes(0)) return null;
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Collects files for a snapshot, applying every filter and redaction as
 * files arrive, so skipped content and secrets are never held in memory.
 */
export function createSnapshotBuilder(limits = LIMITS) {
  const files = new Map<string, string>();
  const byReason: Partial<Record<SkipReason, number>> = {};
  let skippedTotal = 0;
  let totalBytes = 0;
  let redactions = 0;

  function skip(reason: SkipReason) {
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    skippedTotal++;
  }

  return {
    /** Call before reading a file's content. Returns false if it should be skipped. */
    accepts(path: string, size: number): boolean {
      const reason = skipReasonForPath(path) ?? (size > limits.maxFileBytes ? "too-large" : null);
      if (reason) {
        skip(reason);
        return false;
      }
      return true;
    },

    add(path: string, bytes: Uint8Array) {
      const text = decodeText(bytes);
      if (text === null) return skip("binary");

      if (files.size >= limits.maxFiles) throw new RepoTooLargeError("files", limits.maxFiles);
      totalBytes += bytes.byteLength;
      if (totalBytes > limits.maxTotalBytes) {
        throw new RepoTooLargeError("bytes", limits.maxTotalBytes);
      }

      const redacted = redactSecrets(text);
      redactions += redacted.count;
      files.set(path, redacted.text);
    },

    finish(
      meta: Omit<Snapshot, "files" | "totalBytes" | "skipped" | "redactions" | "id">,
    ): Snapshot {
      const sorted = new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
      return {
        ...meta,
        id: `${meta.owner}/${meta.repo}@${meta.sha}`,
        files: sorted,
        totalBytes,
        skipped: { total: skippedTotal, byReason },
        redactions,
      };
    },
  };
}

export type SnapshotBuilder = ReturnType<typeof createSnapshotBuilder>;
