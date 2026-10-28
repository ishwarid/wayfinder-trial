import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract } from "tar-stream";
import { LIMITS, type SnapshotBuilder } from "./snapshot";
import { RepoTooLargeError } from "./types";

/**
 * Streams a GitHub tarball (.tar.gz) into a snapshot builder.
 *
 * GitHub wraps everything in one top-level folder (`owner-repo-sha/`),
 * which is stripped. Files the builder rejects are drained without being
 * buffered, and the download is aborted if it grows past the limit.
 */
export async function extractTarball(
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  builder: SnapshotBuilder,
  maxDownloadBytes = LIMITS.maxDownloadBytes,
) {
  const source =
    body instanceof ReadableStream ? Readable.fromWeb(body as never) : (body as Readable);

  let downloaded = 0;
  source.on("data", (chunk: Buffer) => {
    downloaded += chunk.length;
    if (downloaded > maxDownloadBytes) {
      source.destroy(new RepoTooLargeError("download", maxDownloadBytes));
    }
  });

  const tar = extract();
  tar.on("entry", (header, stream, next) => {
    const path = header.name.split("/").slice(1).join("/");
    const isFile = header.type === "file" && path.length > 0;

    if (!isFile || !builder.accepts(path, header.size ?? 0)) {
      stream.on("end", next);
      stream.resume();
      return;
    }

    const chunks: Buffer[] = [];
    stream.on("data", (chunk: unknown) => chunks.push(chunk as Buffer));
    stream.on("end", () => {
      try {
        builder.add(path, Buffer.concat(chunks));
        next();
      } catch (error) {
        next(error as Error);
      }
    });
  });

  await pipeline(source, createGunzip(), tar);
}
