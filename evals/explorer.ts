/*
 * Runs explorer eval cases through the real agent and tools. Used by the
 * CLI (evals/run.ts) and by the CI test (evals/harness.test.ts).
 */
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { createExplorerAgent } from "../src/lib/agent/agent";
import { isVerified, parseCitations, recordToolOutput, type SeenLines } from "../src/lib/citations";
import { REFERENCES_HEADING } from "../src/lib/agent/instructions";
import type { Snapshot } from "../src/lib/repo/types";
import type { ExplorerCase } from "./cases";

export const PASS_THRESHOLD = 0.8;

export type Check = { name: string; pass: boolean | "skipped"; detail?: string };
export type CaseResult = {
  name: string;
  spec: string;
  pass: boolean;
  checks: Check[];
  reply: string;
  tools: string[];
  citations: { total: number; verified: number };
  ms: number;
};

export async function runCase(
  c: ExplorerCase,
  snapshot: Snapshot,
  model: LanguageModel,
  judge: LanguageModel | null,
): Promise<CaseResult> {
  const started = Date.now();
  const agent = createExplorerAgent({ model, snapshot, audience: c.audience ?? "developer" });
  const result = await agent.generate({ prompt: c.question });

  const tools = result.steps.flatMap((s) => s.toolCalls.map((call) => call.toolName));
  const seen: SeenLines = new Map();
  for (const step of result.steps) {
    for (const r of step.toolResults) recordToolOutput(seen, r.toolName, r.output);
  }
  const reply = result.text.trim();
  const citations = parseCitations(reply);
  const verified = citations.filter((cit) => isVerified(cit, seen));
  const checks: Check[] = [];

  for (const tool of c.expectTools ?? []) {
    checks.push({
      name: `uses ${tool}`,
      pass: tools.includes(tool),
      detail: `used [${tools.join(", ")}]`,
    });
  }
  for (const path of c.expectCited ?? []) {
    checks.push({
      name: `cites ${path}`,
      pass: verified.some((cit) => cit.path === path),
      detail: `verified citations: [${verified.map((v) => `${v.path}:${v.start}`).join(", ")}]`,
    });
  }
  if (citations.length > 0) {
    const unverified = citations.filter((cit) => !isVerified(cit, seen));
    checks.push({
      name: "every citation is verified",
      pass: unverified.length === 0,
      detail: unverified.map((u) => `${u.path}:${u.start}-${u.end}`).join(", "),
    });
  }
  if (c.plainLanguage) {
    const body = reply.split(new RegExp(REFERENCES_HEADING, "i"))[0] ?? "";
    const jargon = findJargon(body);
    checks.push({
      name: "plain language before the code references",
      pass: jargon.length === 0,
      detail: jargon.length ? `found: ${jargon.join(", ")}` : undefined,
    });
    checks.push({
      name: "ends with code references",
      pass: new RegExp(REFERENCES_HEADING, "i").test(reply),
    });
  }
  for (const pattern of c.textMatches ?? []) {
    checks.push({ name: `reply matches ${pattern}`, pass: pattern.test(reply) });
  }
  for (const pattern of c.textExcludes ?? []) {
    checks.push({ name: `reply avoids ${pattern}`, pass: !pattern.test(reply) });
  }
  if (c.judge)
    checks.push(judge ? await judgeReply(judge, c, reply) : { name: "judge", pass: "skipped" });

  return {
    name: c.name,
    spec: c.spec,
    pass: checks.every((check) => check.pass !== false),
    checks,
    reply,
    tools,
    citations: { total: citations.length, verified: verified.length },
    ms: Date.now() - started,
  };
}

/** Code that a non-technical reader shouldn't have to parse. */
export function findJargon(text: string): string[] {
  const patterns: RegExp[] = [
    /`[^`]+`/g, // inline code
    /\b[\w-]+\/[\w./-]+\.[a-z]{1,4}\b/g, // file paths
    /\b[\w-]+\.(?:ts|tsx|js|jsx|py|go|rb|java|cs|php)\b/g, // file names
    /\b[a-z]+(?:[A-Z][a-z0-9]*)+\b/g, // camelCase identifiers
    /\b[a-z]+(?:_[a-z0-9]+)+\b/g, // snake_case identifiers
    /\b(?:function|router|endpoint|handler|null|undefined|boolean|async|middleware)\b/gi,
  ];
  return [...new Set(patterns.flatMap((p) => text.match(p) ?? []))];
}

async function judgeReply(model: LanguageModel, c: ExplorerCase, reply: string): Promise<Check> {
  const { output } = await generateText({
    model,
    temperature: 0,
    output: Output.object({ schema: z.object({ pass: z.boolean(), reason: z.string() }) }),
    prompt: `You are reviewing an AI assistant's answer about a code repository (a small Express store API).

Question:
${c.question}

Answer:
${reply || "(empty)"}

Requirement:
${c.judge}

Does the answer meet the requirement? Reply with pass true or false and a one-sentence reason.`,
  });
  return { name: "judge", pass: output.pass, detail: output.reason };
}

export function toMarkdown(results: CaseResult[], label: string) {
  const passed = results.filter((r) => r.pass).length;
  const totalCitations = results.reduce((n, r) => n + r.citations.total, 0);
  const verifiedCitations = results.reduce((n, r) => n + r.citations.verified, 0);
  const lines = [
    `# Explorer eval: ${label}`,
    "",
    `Run ${new Date().toISOString()}. **${passed}/${results.length} cases passed**, threshold ${PASS_THRESHOLD * 100}%.`,
    `Citation precision: ${verifiedCitations}/${totalCitations} citations verified.`,
    "",
    "| Case | Result | Tools | Citations verified | Time |",
    "| --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.pass ? "Pass" : "**Fail**"} | ${r.tools.join(", ") || "none"} | ${r.citations.verified}/${r.citations.total} | ${(r.ms / 1000).toFixed(1)}s |`,
    ),
  ];
  for (const r of results.filter((x) => !x.pass)) {
    lines.push("", `## ${r.name}`, `Spec: ${r.spec}`, "");
    for (const ch of r.checks.filter((x) => x.pass === false))
      lines.push(`- ${ch.name}${ch.detail ? `: ${ch.detail}` : ""}`);
    lines.push("", "> " + (r.reply || "(empty)").replace(/\n/g, "\n> "));
  }
  return lines.join("\n") + "\n";
}
