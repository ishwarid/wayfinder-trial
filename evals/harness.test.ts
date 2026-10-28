// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDemoModel } from "../src/lib/agent/demo-model";
import { loadSampleSnapshot } from "../src/lib/repo/local";
import { CASES } from "./cases";
import { runCase } from "./explorer";

/*
 * Every eval case against the scripted model: checks the harness and the
 * real tools, citations and redaction in CI, with no key. Judges are skipped
 * here; `npm run eval` with a key runs them.
 */
describe("explorer eval harness (scripted model)", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const snapshot = (await loadSampleSnapshot("tiny-shop"))!;
    const result = await runCase(c, snapshot, createDemoModel(), null);
    const failed = result.checks.filter((check) => check.pass === false);
    expect(failed, JSON.stringify({ failed, reply: result.reply }, null, 2)).toEqual([]);
  });
});
