// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  githubLineUrl,
  isVerified,
  parseCitations,
  recordToolOutput,
  splitCitations,
  type SeenLines,
} from "@/lib/citations";
import { loadSampleSnapshot } from "@/lib/repo/local";
import { buildOverview } from "@/lib/repo/overview";
import { findTodos, findTodosInFile } from "@/lib/repo/todos";
import { createExplorerAgent } from "./agent";
import { createDemoModel, humanize, pickKeyword } from "./demo-model";
import { chooseModel } from "./model";
import { createExplorerTools, READ_MAX_LINES } from "./tools";

const snapshot = () => loadSampleSnapshot("tiny-shop")!;

async function run<T>(value: T | AsyncIterable<T> | PromiseLike<T | AsyncIterable<T>>) {
  return (await value) as T;
}
const opts = { toolCallId: "t", messages: [] } as never;

describe("TODO detection", () => {
  it("finds markers in line and block comments, in several languages", () => {
    const ts = [
      "// TODO: one",
      "const x = 1; // FIXME(alice) two",
      "/*",
      " * HACK three",
      " */",
      "const s = 'TODO not this';",
      'const t = "a // TODO not this either";',
      "this.#BUG = 1;",
    ].join("\n");
    expect(findTodosInFile("a.ts", ts).map((t) => [t.line, t.tag, t.text])).toEqual([
      [1, "TODO", "one"],
      [2, "FIXME", "two"],
      [4, "HACK", "three"],
    ]);
    expect(findTodosInFile("a.py", "x = 1  # XXX check this").map((t) => t.tag)).toEqual(["XXX"]);
    expect(findTodosInFile("a.ts", "x = 1  # XXX not a comment in TS")).toEqual([]);
  });

  it("finds the sample repository's TODOs but not the string", async () => {
    const todos = findTodos(await snapshot());
    expect(todos.map((t) => `${t.tag} ${t.path}:${t.line}`)).toEqual(
      expect.arrayContaining([
        "FIXME src/lib/discounts.ts:33",
        "FIXME src/routes/checkout.ts:31",
        "HACK src/lib/payments.ts:9",
        "XXX src/lib/inventory.ts:14",
        "TODO src/server.ts:13",
      ]),
    );
    expect(todos.some((t) => t.path === "src/lib/orders.ts")).toBe(false);
  });
});

describe("overview", () => {
  it("summarises the sample repository without AI", async () => {
    const overview = buildOverview(await snapshot());
    expect(overview.languages[0]?.name).toBe("TypeScript");
    expect(overview.frameworks).toEqual(["Express"]);
    expect(overview.entryPoints).toContain("src/server.ts");
    expect(overview.readme?.path).toBe("README.md");
    expect(overview.todoCount).toBeGreaterThanOrEqual(7);
  });
});

describe("explorer tools", () => {
  it("reads line ranges with line numbers, capped", async () => {
    const tools = createExplorerTools(await snapshot());
    const out = await run(
      tools.readFile.execute!({ path: "src/lib/discounts.ts", startLine: 10, endLine: 12 }, opts),
    );
    expect(out).toMatchObject({ path: "src/lib/discounts.ts", startLine: 10, endLine: 12 });
    expect((out as { content: string }).content.split("\n")[0]).toMatch(/^10\| /);

    const big = createExplorerTools({
      ...(await snapshot()),
      files: new Map([["big.ts", Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n")]]),
    });
    const capped = await run(big.readFile.execute!({ path: "big.ts" }, opts));
    expect((capped as { endLine: number }).endLine).toBe(READ_MAX_LINES);
    expect((capped as { totalLines: number }).totalLines).toBe(1000);
  });

  it("suggests similar paths when a file doesn't exist", async () => {
    const tools = createExplorerTools(await snapshot());
    const out = await run(tools.readFile.execute!({ path: "discounts.ts" }, opts));
    expect(out).toMatchObject({ similar: ["src/lib/discounts.ts"] });
  });

  it("searches literally and case-insensitively", async () => {
    const tools = createExplorerTools(await snapshot());
    const out = await run(tools.searchCode.execute!({ text: "applydiscounts(" }, opts));
    expect(out.matches.map((m) => m.path)).toEqual(
      expect.arrayContaining(["src/lib/discounts.ts", "src/routes/checkout.ts"]),
    );
    // A regex metacharacter is just a character.
    const literal = await run(tools.searchCode.execute!({ text: "(.*)" }, opts));
    expect(literal.totalMatches).toBe(0);
  });

  it("never exposes the planted secret", async () => {
    const tools = createExplorerTools(await snapshot());
    const read = await run(tools.readFile.execute!({ path: "config/settings.ts" }, opts));
    expect(JSON.stringify(read)).not.toContain("pk-fake-9f8e7d6c5b4a3210");
    const search = await run(tools.searchCode.execute!({ text: "9f8e7d6c" }, opts));
    expect(search.totalMatches).toBe(0);
  });
});

describe("citations", () => {
  it("parses paths with single lines and ranges", () => {
    expect(
      parseCitations("See `src/lib/discounts.ts:14-22` and package.json:3, not v1.2:3"),
    ).toEqual([
      { path: "src/lib/discounts.ts", start: 14, end: 22 },
      { path: "package.json", start: 3, end: 3 },
    ]);
  });

  it("keeps the text around citations", () => {
    expect(splitCitations("In a.ts:2 done").map((s) => s.kind)).toEqual([
      "text",
      "citation",
      "text",
    ]);
  });

  it("verifies only lines a tool returned", () => {
    const seen: SeenLines = new Map();
    recordToolOutput(seen, "readFile", { path: "a.ts", startLine: 10, endLine: 20 });
    recordToolOutput(seen, "searchCode", { matches: [{ path: "b.ts", line: 5 }] });

    expect(isVerified({ path: "a.ts", start: 12, end: 18 }, seen)).toBe(true);
    expect(isVerified({ path: "a.ts", start: 18, end: 25 }, seen)).toBe(false);
    expect(isVerified({ path: "b.ts", start: 5, end: 5 }, seen)).toBe(true);
    expect(isVerified({ path: "c.ts", start: 1, end: 1 }, seen)).toBe(false);
  });

  it("links to the exact lines at the pinned commit", () => {
    expect(
      githubLineUrl(
        { owner: "acme", repo: "shop", sha: "abc" },
        { path: "src/a b.ts", start: 3, end: 7 },
      ),
    ).toBe("https://github.com/acme/shop/blob/abc/src/a%20b.ts#L3-L7");
  });
});

describe("model selection", () => {
  it.each([
    [{}, "demo"],
    [{ GROQ_API_KEY: "g" }, "groq"],
    [{ GOOGLE_GENERATIVE_AI_API_KEY: "k", GROQ_API_KEY: "g" }, "gemini"],
    [{ GOOGLE_GENERATIVE_AI_API_KEY: "k", GROQ_API_KEY: "g", AI_PROVIDER: "groq" }, "groq"],
    [{ GROQ_API_KEY: "g", AI_PROVIDER: "demo" }, "demo"],
  ])("%j → %s", (env, provider) => {
    expect(chooseModel(env as unknown as NodeJS.ProcessEnv).provider).toBe(provider);
  });

  it("warns when the requested provider has no key", () => {
    expect(chooseModel({ AI_PROVIDER: "gemini" } as unknown as NodeJS.ProcessEnv)).toMatchObject({
      provider: "demo",
      warning: expect.stringContaining("GOOGLE_GENERATIVE_AI_API_KEY"),
    });
  });
});

describe("audience", () => {
  it("tells the model to keep code out of product answers", async () => {
    const { explorerInstructions, REFERENCES_HEADING } = await import("./instructions");
    const product = explorerInstructions(await snapshot(), "product");
    expect(product).toContain("product manager");
    expect(product).toContain("no file or folder names");
    expect(product).toContain(REFERENCES_HEADING);
    expect(explorerInstructions(await snapshot(), "developer")).toContain(
      "Cite the code behind every claim inline",
    );
  });

  it("writes plain-language product answers with references only at the end", async () => {
    const agent = createExplorerAgent({
      model: createDemoModel(),
      snapshot: await snapshot(),
      audience: "product",
    });
    const result = await agent.generate({ prompt: "How do discounts work?" });
    const [body, refs] = result.text.split("Where this lives in the code");

    expect(body).toMatch(/\$50/);
    expect(body).not.toMatch(/`|\.ts\b|src\//);
    expect(parseCitations(refs ?? "")[0]?.path).toBe("src/lib/discounts.ts");
  });

  it("turns code names into words in product answers", () => {
    expect(humanize("if createOrder() throws, retry `chargeCard`")).toBe(
      "if create order throws, retry charge card",
    );
    expect(humanize("move carts to session_store")).toBe("move carts to session store");
  });
});

describe("explorer agent (scripted model)", () => {
  it("picks a sensible search keyword", () => {
    expect(pickKeyword("Where are discounts calculated?")).toBe("discount");
    expect(pickKeyword("Walk me through the checkout flow")).toBe("checkout");
    expect(pickKeyword("What does this repo do?")).toBeNull();
  });

  it("searches, reads, and answers with verified citations", async () => {
    const agent = createExplorerAgent({
      model: createDemoModel(),
      snapshot: await snapshot(),
      audience: "developer",
    });
    const result = await agent.generate({ prompt: "Where are discounts calculated?" });

    const tools = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    expect(tools).toEqual(["searchCode", "readFile"]);

    const seen: SeenLines = new Map();
    for (const step of result.steps) {
      for (const r of step.toolResults) recordToolOutput(seen, r.toolName, r.output);
    }
    const citations = parseCitations(result.text);
    expect(citations.some((c) => c.path === "src/lib/discounts.ts")).toBe(true);
    expect(citations.every((c) => isVerified(c, seen))).toBe(true);
  });
});
