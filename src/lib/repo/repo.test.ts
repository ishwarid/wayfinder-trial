// @vitest-environment node
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pack } from "tar-stream";
import { describe, expect, it, vi } from "vitest";
import { createAccessCache, createSnapshotCache } from "./cache";
import { openRepo } from "./load";
import { loadSampleSnapshot } from "./local";
import { parseRepoInput } from "./parse";
import { REDACTED, redactSecrets } from "./redact";
import { createSnapshotBuilder, skipReasonForPath } from "./snapshot";
import { extractTarball } from "./tarball";
import { RepoTooLargeError } from "./types";

describe("parseRepoInput", () => {
  it.each([
    ["acme/shop", { owner: "acme", repo: "shop" }],
    ["https://github.com/acme/shop", { owner: "acme", repo: "shop" }],
    ["github.com/acme/shop.git", { owner: "acme", repo: "shop" }],
    ["git@github.com:acme/shop.git", { owner: "acme", repo: "shop" }],
    ["https://github.com/acme/shop/tree/develop", { owner: "acme", repo: "shop", ref: "develop" }],
    [
      "https://github.com/acme/shop/blob/main/src/app.ts#L10",
      { owner: "acme", repo: "shop", ref: "main" },
    ],
    ["https://github.com/acme/shop/issues/4", { owner: "acme", repo: "shop" }],
  ])("parses %s", (input, expected) => {
    expect(parseRepoInput(input)).toEqual(expected);
  });

  it.each(["", "not a repo", "acme", "https://gitlab.com/acme/shop", "-bad/repo", "acme/.."])(
    "rejects %j",
    (input) => {
      expect(parseRepoInput(input)).toBeNull();
    },
  );
});

describe("redactSecrets", () => {
  it.each([
    'const API_KEY = "abcd1234efgh5678";',
    '"client_secret": "s3cr3t-value-here"',
    "AWS_KEY=AKIAABCDEFGHIJKLMNOP",
    "token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "stripe = sk_live_abcdefghijklmnop1234",
    "DATABASE_URL=postgres://shop:hunter2pass@db.example.com/shop",
  ])("redacts %s", (line) => {
    const { text, count } = redactSecrets(line);
    expect(count).toBeGreaterThan(0);
    expect(text).toContain(REDACTED);
  });

  it("keeps the quoting and the rest of the line", () => {
    expect(redactSecrets('const API_KEY = "abcd1234efgh5678"; // test').text).toBe(
      `const API_KEY = "${REDACTED}"; // test`,
    );
  });

  it("replaces private key blocks line by line, keeping line numbers", () => {
    const input = [
      "a",
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEow",
      "abc",
      "-----END RSA PRIVATE KEY-----",
      "b",
    ].join("\n");
    const out = redactSecrets(input).text.split("\n");
    expect(out).toHaveLength(6);
    expect(out[0]).toBe("a");
    expect(out.slice(1, 5).every((line) => line === REDACTED)).toBe(true);
    expect(out[5]).toBe("b");
  });

  it("leaves ordinary code alone", () => {
    const code = 'const tokenCount = tokens.length;\nconst label = "short";';
    expect(redactSecrets(code)).toEqual({ text: code, count: 0 });
  });
});

describe("skipReasonForPath", () => {
  it.each([
    ["node_modules/x/index.js", "dependency-or-build"],
    ["packages/a/dist/out.js", "dependency-or-build"],
    ["package-lock.json", "lockfile"],
    ["assets/logo.png", "binary"],
    [".env", "secret-file"],
    ["config/.env.production", "secret-file"],
    ["certs/server.pem", "secret-file"],
    ["public/app.min.js", "generated"],
  ])("skips %s as %s", (path, reason) => {
    expect(skipReasonForPath(path)).toBe(reason);
  });

  it.each(["src/index.ts", ".env.example", "README.md", "docs/build.md"])("keeps %s", (path) => {
    expect(skipReasonForPath(path)).toBeNull();
  });
});

describe("snapshot builder", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("skips binary content even with a text extension", () => {
    const builder = createSnapshotBuilder();
    builder.add("weird.txt", new Uint8Array([0x89, 0x00, 0x01]));
    const snapshot = builder.finish(meta());
    expect(snapshot.files.size).toBe(0);
    expect(snapshot.skipped.byReason.binary).toBe(1);
  });

  it("refuses files over the size limit before reading them", () => {
    const builder = createSnapshotBuilder({ ...limits(), maxFileBytes: 10 });
    expect(builder.accepts("big.ts", 11)).toBe(false);
    expect(builder.finish(meta()).skipped.byReason["too-large"]).toBe(1);
  });

  it("throws a clear error past the file limit", () => {
    const builder = createSnapshotBuilder({ ...limits(), maxFiles: 1 });
    builder.add("a.ts", bytes("a"));
    expect(() => builder.add("b.ts", bytes("b"))).toThrow(RepoTooLargeError);
  });

  it("redacts as files are added and counts redactions", () => {
    const builder = createSnapshotBuilder();
    builder.add("config.ts", bytes('export const SECRET_TOKEN = "abcdefgh12345678";'));
    const snapshot = builder.finish(meta());
    expect(snapshot.files.get("config.ts")).toContain(REDACTED);
    expect(snapshot.redactions).toBe(1);
  });
});

describe("extractTarball", () => {
  it("strips GitHub's top folder and applies the filters", async () => {
    const tarball = await makeTarball({
      "src/index.ts": "export const x = 1;\n",
      "node_modules/dep/index.js": "module.exports = 1;",
      "yarn.lock": "lock",
      "logo.png": "\x89PNG",
    });
    const builder = createSnapshotBuilder();
    await extractTarball(Readable.from(tarball), builder);
    const snapshot = builder.finish(meta());

    expect([...snapshot.files.keys()]).toEqual(["src/index.ts"]);
    expect(snapshot.skipped.total).toBe(3);
  });

  it("aborts downloads over the limit", async () => {
    const tarball = await makeTarball({ "a.ts": "x".repeat(50_000) });
    await expect(
      extractTarball(Readable.from(tarball), createSnapshotBuilder(), 100),
    ).rejects.toThrow(RepoTooLargeError);
  });
});

describe("openRepo", () => {
  const SHA = "a".repeat(40);

  function fakeGitHub({ isPrivate = false, visibleTo = ["user-token"] } = {}) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "");
      const path = String(url).replace("https://api.github.com", "");
      const canSee = !isPrivate || (auth !== undefined && visibleTo.includes(auth));
      if (!canSee) return new Response("{}", { status: 404 });

      if (path === "/repos/acme/shop") {
        return Response.json({
          owner: { login: "acme" },
          name: "shop",
          private: isPrivate,
          default_branch: "main",
          description: "A shop",
          html_url: "https://github.com/acme/shop",
          size: 10,
        });
      }
      if (path === "/repos/acme/shop/commits/main") return new Response(SHA);
      if (path === `/repos/acme/shop/tarball/${SHA}`) {
        return new Response(
          Readable.toWeb(Readable.from(await makeTarball({ "src/app.ts": "x" }))) as ReadableStream,
        );
      }
      return new Response("{}", { status: 404 });
    });
  }

  const caches = () => ({ snapshots: createSnapshotCache(), access: createAccessCache() });

  it("pins the default branch to a commit and loads files", async () => {
    const result = await openRepo({ owner: "acme", repo: "shop" }, undefined, {
      fetch: fakeGitHub() as never,
      ...caches(),
    });
    expect(result.ok && result.snapshot.id).toBe(`acme/shop@${SHA}`);
    expect(result.ok && [...result.snapshot.files.keys()]).toEqual(["src/app.ts"]);
  });

  it("checks access again before serving a cached private repo", async () => {
    const shared = caches();
    const fetch = fakeGitHub({ isPrivate: true });

    const owner = await openRepo({ owner: "acme", repo: "shop" }, "user-token", {
      fetch: fetch as never,
      ...shared,
    });
    expect(owner.ok).toBe(true);
    expect(shared.snapshots.size).toBe(1);

    const stranger = await openRepo({ owner: "acme", repo: "shop", ref: SHA }, "other-token", {
      fetch: fetch as never,
      ...shared,
    });
    expect(stranger).toEqual({ ok: false, error: { kind: "not-found" } });
  });

  it("never shows a private repo through the server token", async () => {
    const result = await openRepo({ owner: "acme", repo: "shop" }, undefined, {
      fetch: fakeGitHub({ isPrivate: true, visibleTo: ["server-token"] }) as never,
      serverToken: "server-token",
      ...caches(),
    });
    expect(result).toEqual({ ok: false, error: { kind: "not-found" } });
  });

  it("reports rate limiting with the reset time", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" },
        }),
    );
    const result = await openRepo({ owner: "acme", repo: "shop" }, undefined, {
      fetch: fetch as never,
      ...caches(),
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "rate-limited", resetAt: new Date(1_800_000_000_000) },
    });
  });
});

describe("snapshot cache", () => {
  it("evicts the least recently used snapshot", () => {
    const cache = createSnapshotCache({ maxEntries: 2 });
    const snap = (id: string) => ({ ...createSnapshotBuilder().finish(meta()), id });
    cache.set(snap("a"));
    cache.set(snap("b"));
    cache.get("a");
    cache.set(snap("c"));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
  });
});

describe("sample repository", () => {
  it("loads tiny-shop with filters and redaction applied", async () => {
    const snapshot = (await loadSampleSnapshot("tiny-shop"))!;
    const paths = [...snapshot.files.keys()];

    expect(paths).toContain("src/lib/discounts.ts");
    expect(paths).toContain(".env.example");
    expect(paths).not.toContain(".env");
    expect(paths.some((p) => p.startsWith("node_modules/"))).toBe(false);
    expect(paths).not.toContain("package-lock.json");
    expect(paths).not.toContain("assets/logo.png");
    expect(snapshot.files.get("config/settings.ts")).not.toContain("pk-fake-9f8e7d6c5b4a3210");
    expect(snapshot.redactions).toBeGreaterThan(0);
  });
});

function meta() {
  return {
    owner: "acme",
    repo: "shop",
    sha: "a".repeat(40),
    ref: "main",
    isPrivate: false,
    description: null,
    source: "github" as const,
  };
}

function limits() {
  return { maxFileBytes: 512 * 1024, maxFiles: 5000, maxTotalBytes: 1e9, maxDownloadBytes: 1e9 };
}

/** Builds a tar.gz the way GitHub does: everything under one top-level folder. */
async function makeTarball(files: Record<string, string>): Promise<Buffer> {
  const tar = pack();
  for (const [path, content] of Object.entries(files)) {
    tar.entry({ name: `acme-shop-abc123/${path}` }, content);
  }
  tar.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of tar.pipe(createGzip())) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe("openRepo when GitHub is unreachable", () => {
  it("reports a failure instead of throwing", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await openRepo({ owner: "acme", repo: "shop" }, undefined, {
      fetch: fetch as never,
      snapshots: createSnapshotCache(),
      access: createAccessCache(),
    });
    expect(result).toEqual({ ok: false, error: { kind: "failed", status: 503 } });
    log.mockRestore();
  });
});

describe("describeOpenError", () => {
  it("only blames the session when the user is signed in", async () => {
    const { describeOpenError } = await import("./errors");
    expect(describeOpenError({ kind: "unauthorized" }, { signedIn: true }).title).toMatch(
      /session has expired/,
    );
    expect(describeOpenError({ kind: "unauthorized" }, { signedIn: false }).title).toBe(
      "GitHub refused the request",
    );
  });

  it("points signed-out users at sign-in for missing repos", async () => {
    const { describeOpenError } = await import("./errors");
    expect(describeOpenError({ kind: "not-found" }, { signedIn: false }).message).toMatch(
      /Sign in/,
    );
  });
});
