// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createDemoModel } from "@/lib/agent/demo-model";
import { finishLogin, safeReturnTo, startLogin } from "@/lib/auth";
import { handleChat, type ChatDeps } from "@/lib/chat-handler";
import { createFixedWindowLimiter } from "@/lib/limits";
import { loadSampleSnapshot } from "@/lib/repo/local";
import { readCookie, sealSession, SESSION_COOKIE, unsealSession } from "@/lib/session";

const SECRET = "a-session-secret-that-is-at-least-32-chars";
const env = {
  GITHUB_CLIENT_ID: "Iv1.client",
  GITHUB_CLIENT_SECRET: "shh",
  SESSION_SECRET: SECRET,
  NODE_ENV: "test",
};

describe("sessions", () => {
  const session = {
    token: "ghu_x",
    login: "ishwari",
    avatarUrl: "a",
    expiresAt: Date.now() + 60_000,
  };

  it("round-trips", () => {
    expect(unsealSession(sealSession(session, SECRET), SECRET)).toEqual(session);
  });

  it("rejects tampered cookies", () => {
    const sealed = sealSession(session, SECRET);
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(unsealSession(tampered, SECRET)).toBeNull();
    expect(unsealSession(sealed, "a-different-secret-of-at-least-32-chars")).toBeNull();
  });

  it("rejects expired sessions", () => {
    expect(unsealSession(sealSession({ ...session, expiresAt: 1 }, SECRET), SECRET)).toBeNull();
  });
});

describe("GitHub sign-in", () => {
  it("only allows same-site return paths", () => {
    expect(safeReturnTo("/r/acme/shop")).toBe("/r/acme/shop");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
  });

  it("redirects to GitHub with a state that's also stored in a cookie", () => {
    const response = startLogin(new Request("https://wf.test/api/auth/login?returnTo=/r/a/b"), env);
    const location = new URL(response.headers.get("location")!);
    const state = location.searchParams.get("state")!;

    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe("https://wf.test/api/auth/callback");
    expect(readCookie(response.headers.get("set-cookie"), "wf-oauth-state")).toBe(
      `${state}|/r/a/b`,
    );
  });

  it("says when sign-in isn't configured", () => {
    const response = startLogin(new Request("https://wf.test/api/auth/login"), {});
    expect(response.headers.get("location")).toBe("/?auth=not-configured");
  });

  it("refuses a callback whose state doesn't match the browser's", async () => {
    const fetch = vi.fn();
    const response = await finishLogin(
      new Request("https://wf.test/api/auth/callback?code=c&state=attacker", {
        headers: { cookie: "wf-oauth-state=mine|/" },
      }),
      { env, fetch },
    );
    expect(response.headers.get("location")).toBe("/?auth=state-mismatch");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("exchanges the code and sets an encrypted session", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("access_token")) {
        return Response.json({ access_token: "ghu_token", expires_in: 28_800 });
      }
      return Response.json({ login: "ishwari", avatar_url: "https://avatars.example/i" });
    });
    const response = await finishLogin(
      new Request("https://wf.test/api/auth/callback?code=c&state=s1", {
        headers: { cookie: "wf-oauth-state=s1|/r/acme/shop" },
      }),
      { env, fetch: fetch as never },
    );

    expect(response.headers.get("location")).toBe("/r/acme/shop");
    const cookies = response.headers.getSetCookie();
    const sealed = cookies.map((c) => readCookie(c, SESSION_COOKIE)).find(Boolean);
    expect(unsealSession(sealed, SECRET)).toMatchObject({ token: "ghu_token", login: "ishwari" });
    expect(cookies.join(";")).not.toContain("ghu_token");
  });
});

/** The text a UI message stream spelled out, joined from its text deltas. */
function streamedText(body: string) {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)))
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => chunk.delta)
    .join("");
}

describe("POST /api/chat", () => {
  const SHA = "0".repeat(40);

  function setup(overrides: Partial<ChatDeps> = {}) {
    const model = createDemoModel();
    const doStream = vi.spyOn(model, "doStream");
    const open = vi.fn(async () => ({
      ok: true as const,
      snapshot: (await loadSampleSnapshot("tiny-shop"))!,
    }));
    const deps: ChatDeps = {
      model,
      open,
      userToken: undefined,
      dailyLimiter: createFixedWindowLimiter({ limit: 50, windowMs: 86_400_000 }),
      globalLimiter: createFixedWindowLimiter({ limit: 50, windowMs: 60_000 }),
      ...overrides,
    };
    return { deps, doStream, open };
  }

  const request = (text: string, sha = SHA, extra: Record<string, unknown> = {}) =>
    new Request("https://wf.test/api/chat", {
      method: "POST",
      body: JSON.stringify({
        ...extra,
        owner: "_sample",
        repo: "tiny-shop",
        sha,
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
      }),
    });

  it("streams an answer that explored the code", async () => {
    const { deps, open } = setup();
    const response = await handleChat(request("Where are discounts calculated?"), deps);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(open).toHaveBeenCalledWith({ owner: "_sample", repo: "tiny-shop", ref: SHA }, undefined);
    expect(body).toContain("searchCode");
    expect(body).toContain("src/lib/discounts.ts");
  });

  // Streams two full answers word by word at the scripted model's pace.
  it("writes for a product audience by default, and for developers when asked", async () => {
    const product = streamedText(
      await (await handleChat(request("How do discounts work?"), setup().deps)).text(),
    );
    expect(product).toContain("Where this lives in the code");

    const developer = streamedText(
      await (
        await handleChat(
          request("How do discounts work?", SHA, { audience: "developer" }),
          setup().deps,
        )
      ).text(),
    );
    expect(developer).not.toContain("Where this lives in the code");
  }, 20_000);

  it("rejects an unknown audience", async () => {
    const { deps, open } = setup();
    const response = await handleChat(request("hi", SHA, { audience: "investors" }), deps);
    expect(response.status).toBe(400);
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects a malformed commit without touching GitHub", async () => {
    const { deps, open } = setup();
    const response = await handleChat(request("hi", "main"), deps);
    expect(response.status).toBe(400);
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects long messages before opening the repo or calling the model", async () => {
    const { deps, open, doStream } = setup();
    const response = await handleChat(request("x".repeat(3_000)), deps);
    expect(response.status).toBe(413);
    expect(open).not.toHaveBeenCalled();
    expect(doStream).not.toHaveBeenCalled();
  });

  it("refuses when the user can't access the repository", async () => {
    const { deps, doStream } = setup({
      open: async () => ({ ok: false, error: { kind: "not-found" } }),
    });
    const response = await handleChat(request("hi"), deps);
    expect(response.status).toBe(404);
    expect(doStream).not.toHaveBeenCalled();
  });

  it("enforces the daily limit", async () => {
    const { deps } = setup({
      dailyLimiter: createFixedWindowLimiter({ limit: 0, windowMs: 1000 }),
    });
    const response = await handleChat(request("hi"), deps);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe("daily-limit");
  });
});
