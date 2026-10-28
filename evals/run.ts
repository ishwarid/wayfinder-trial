/*
 * Explorer eval CLI.
 *
 *   npm run eval                     uses Gemini or Groq if a key is set,
 *                                    otherwise the scripted model
 *   EVAL_ONLY="checkout" npm run eval   only cases whose name contains this
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chooseModel } from "../src/lib/agent/model";
import { loadSampleSnapshot } from "../src/lib/repo/local";
import { CASES } from "./cases";
import { PASS_THRESHOLD, runCase, toMarkdown, type CaseResult } from "./explorer";

async function main() {
  const { model, provider, label } = chooseModel();
  const judge = provider === "demo" ? null : model;
  const snapshot = (await loadSampleSnapshot("tiny-shop"))!;
  const only = process.env.EVAL_ONLY?.toLowerCase();
  const cases = CASES.filter((c) => !only || c.name.toLowerCase().includes(only));
  // Free tiers allow a handful of requests a minute; each case uses 2 to 6.
  const pause = provider === "demo" ? 0 : Number(process.env.EVAL_DELAY_MS ?? 4000);

  console.log(`Explorer eval with ${label}${judge ? "" : " (judges skipped)"}\n`);
  const results: CaseResult[] = [];
  for (const c of cases) {
    let result: CaseResult;
    try {
      result = await runCase(c, snapshot, model, judge);
    } catch (error) {
      result = {
        name: c.name,
        spec: c.spec,
        pass: false,
        checks: [{ name: "runs without error", pass: false, detail: String(error) }],
        reply: "",
        tools: [],
        citations: { total: 0, verified: 0 },
        ms: 0,
      };
    }
    results.push(result);
    const failed = result.checks.filter((ch) => ch.pass === false).map((ch) => ch.name);
    console.log(
      `${result.pass ? "PASS" : "FAIL"}  ${c.name}${failed.length ? `  (${failed.join("; ")})` : ""}`,
    );
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
  }

  const passRate = results.filter((r) => r.pass).length / (results.length || 1);
  console.log(`\n${Math.round(passRate * 100)}% passed (threshold ${PASS_THRESHOLD * 100}%)`);
  mkdirSync("evals/results", { recursive: true });
  const base = `evals/results/${provider}-latest`;
  writeFileSync(`${base}.json`, JSON.stringify({ model: label, passRate, results }, null, 2));
  writeFileSync(`${base}.md`, toMarkdown(results, label));
  console.log(`Report written to ${base}.md`);
  if (passRate < PASS_THRESHOLD) process.exitCode = 1;
}

main();
