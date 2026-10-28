import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { REFERENCES_HEADING } from "./instructions";

/*
 * A scripted stand-in for a real model, used when no AI key is set.
 *
 * It explores like a careful newcomer: overview for broad questions, search
 * for a keyword, then read around the best match, and answers only from
 * what the tools returned (with citations). It runs the real tools on the
 * real snapshot, so the app, tests and evals work offline end to end.
 */

type Decision =
  | { kind: "text"; text: string }
  | { kind: "tool"; toolName: string; input: Record<string, unknown> };

const TODO_QUESTION = /\b(todos?|fixmes?|hacks?|unfinished|tech(nical)? debt)\b/i;
const OVERVIEW_QUESTION =
  /\b(what (does|is) (this|the) (repo|repository|project|product|app|codebase)|overview|tech stack|summari[sz]e (this|the) (repo|repository|project|codebase)|about this (repo|project))\b/i;

// General "how is this put together" questions start at the entry point.
const FLOW_QUESTION =
  /\b(flows?|journey|business (logic|rules)|architecture|how does (it|this|the app) work|core|main)\b/i;
// Questions about the whole product rather than one feature: start from the overview.
const WHOLE_PRODUCT =
  /\b(main|core|overall|whole|end[- ]to[- ]end) (flow|journey|customer journey|business (logic|rules)|process)\b|\barchitecture\b/i;

const STOP_WORDS = new Set(
  (
    "a an and are as at be by can could do does for from how i if in is it its me my of on or our so " +
    "that the this to was what when where which who why will with you your there here show tell find " +
    "explain walk through flow flows work works working logic business code file files repo " +
    "repository project app calculated computed handled happens happen done used use please about " +
    "give summary summarise summarize core main important key central rules rule "
  )
    .trim()
    .split(/\s+/),
);

export function createDemoModel(): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "wayfinder-demo",
    modelId: "scripted",
    supportedUrls: {},
    async doGenerate(options: LanguageModelV4CallOptions) {
      const decision = decide(options.prompt);
      return {
        content: [toContent(decision)],
        finishReason: finish(decision),
        usage: USAGE,
        warnings: [],
      };
    },
    async doStream(options: LanguageModelV4CallOptions) {
      return {
        stream: simulateReadableStream<LanguageModelV4StreamPart>({
          chunks: toStreamParts(decide(options.prompt)),
          initialDelayInMs: 200,
          chunkDelayInMs: 25,
        }),
      };
    },
  };
}

export function decide(prompt: LanguageModelV4Prompt): Decision {
  const question = lastUserText(prompt);
  const last = prompt.at(-1);

  if (last?.role === "tool") {
    const result = last.content.findLast((part) => part.type === "tool-result");
    if (result?.type === "tool-result" && result.output.type === "json") {
      const value = result.output.value as Record<string, unknown>;
      return isProduct(prompt)
        ? productAnswer(result.toolName, value, question)
        : afterTool(result.toolName, value, question);
    }
    return { kind: "text", text: "Something went wrong reading the repository. Try asking again." };
  }

  // A question naming a file: read it.
  const path = question.match(/(?:^|\s)((?:[\w@.-]+\/)+[\w@.-]+\.[a-z]+)\b/i)?.[1];
  if (path) return { kind: "tool", toolName: "readFile", input: { path } };

  if (TODO_QUESTION.test(question)) return { kind: "tool", toolName: "findTodos", input: {} };
  const keyword = pickKeyword(question);
  if (OVERVIEW_QUESTION.test(question) || WHOLE_PRODUCT.test(question) || !keyword) {
    return { kind: "tool", toolName: "getOverview", input: {} };
  }
  return { kind: "tool", toolName: "searchCode", input: { text: keyword } };
}

export function pickKeyword(question: string): string | null {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const word = words[0];
  if (!word) return null;
  // "discounts" → "discount", but not "address" → "addres".
  return word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

type Match = { path: string; line: number };

function afterTool(toolName: string, value: Record<string, unknown>, question: string): Decision {
  switch (toolName) {
    case "searchCode": {
      const matches = (value.matches ?? []) as Match[];
      if (matches.length === 0) {
        const term = pickKeyword(question) ?? "that";
        return {
          kind: "text",
          text: `I couldn't find "${term}" anywhere in this repository, so I can't say how it works here.`,
        };
      }
      // Read around the first match in the file with the most matches.
      const counts = new Map<string, number>();
      for (const m of matches) counts.set(m.path, (counts.get(m.path) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      const first = matches.find((m) => m.path === best)!;
      return {
        kind: "tool",
        toolName: "readFile",
        input: { path: best, startLine: Math.max(1, first.line - 12), endLine: first.line + 40 },
      };
    }

    case "readFile": {
      if (typeof value.error === "string")
        return { kind: "text", text: "I couldn't open that file." };
      return { kind: "text", text: describeRead(value, pickKeyword(question)) };
    }

    case "findTodos": {
      const items = (value.items ?? []) as Array<Match & { tag: string; text: string }>;
      if (items.length === 0)
        return { kind: "text", text: "There are no TODO-style comments in this repository." };
      const rank = ["FIXME", "BUG", "HACK", "XXX", "TODO"];
      const sorted = [...items].sort((a, b) => rank.indexOf(a.tag) - rank.indexOf(b.tag));
      const counts = Object.entries(value.byTag as Record<string, number>)
        .filter(([, n]) => n > 0)
        .map(([tag, n]) => `${n} ${tag}`)
        .join(", ");
      const list = sorted
        .slice(0, 8)
        .map((t) => `- **${t.tag}** \`${t.path}:${t.line}\`: ${t.text}`)
        .join("\n");
      return {
        kind: "text",
        text: `I found ${items.length} TODO-style comments (${counts}). FIXMEs and HACKs usually carry the most risk, so they're first:\n${list}`,
      };
    }

    case "getOverview": {
      const o = value as {
        name: string;
        description: string | null;
        fileCount: number;
        languages: Array<{ name: string; files: number }>;
        frameworks: string[];
        entryPoints: string[];
        readme: { path: string; endLine: number } | null;
        todoCount: number;
      };
      if (FLOW_QUESTION.test(question) && o.entryPoints[0]) {
        return {
          kind: "tool",
          toolName: "readFile",
          input: { path: o.entryPoints[0], startLine: 1, endLine: 80 },
        };
      }
      const lang = o.languages[0];
      const parts = [
        `**${o.name}**${o.description ? `: ${o.description}` : ""}`,
        `It has ${o.fileCount} readable files${lang ? `, mostly ${lang.name}` : ""}${o.frameworks.length ? `, built with ${o.frameworks.join(", ")}` : ""}.`,
      ];
      if (o.readme)
        parts.push(
          `The README explains it further: \`${o.readme.path}:1-${Math.min(o.readme.endLine, 5)}\`.`,
        );
      if (o.entryPoints.length) {
        parts.push(
          `Good places to start reading:\n${o.entryPoints.map((p) => `- \`${p}\``).join("\n")}`,
        );
      }
      if (o.todoCount)
        parts.push(`There are ${o.todoCount} TODO-style comments; ask me about them.`);
      return { kind: "text", text: parts.join("\n\n") };
    }

    default:
      return { kind: "text", text: "I couldn't work that out from the code." };
  }
}

/** Summarise a readFile result from doc comments and definitions only. */
function describeRead(value: Record<string, unknown>, keyword: string | null): string {
  const path = value.path as string;
  const start = value.startLine as number;
  const end = value.endLine as number;
  const lines = (value.content as string).split("\n").map((l) => {
    const [num, ...rest] = l.split("| ");
    return { n: Number(num), text: rest.join("| ") };
  });

  // Only /** */ doc comments: ordinary comments can contain anything,
  // including text addressed to AI assistants.
  const doc: string[] = [];
  let inDoc = false;
  for (const { text } of lines) {
    const t = text.trim();
    if (t.startsWith("/**")) inDoc = true;
    if (inDoc) {
      const cleaned = t
        .replace(/^\/\*\*|\*\/$|^\*/g, "")
        .trim()
        .replace(/^[-*]\s+/, "");
      if (cleaned) doc.push(cleaned);
    }
    if (t.endsWith("*/")) inDoc = false;
  }

  const definitions = lines
    .map(({ n, text }) => ({
      n,
      m: text.match(/^(?:export\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/),
    }))
    .filter((d) => d.m)
    .slice(0, 6)
    .map((d) => `- \`${d.m![1]}\` at \`${path}:${d.n}\``);

  const routes = lines
    .map(({ n, text }) => ({
      n,
      m: text.match(/\.(get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)/),
    }))
    .filter((r) => r.m)
    .slice(0, 8)
    .map((r) => `- \`${r.m![1]!.toUpperCase()} ${r.m![2]}\` at \`${path}:${r.n}\``);

  const modules = lines
    .map(({ n, text }) => ({ n, m: text.match(/^\s*import .* from ["'](\.{1,2}\/[^"']+)["']/) }))
    .filter((i) => i.m)
    .slice(0, 8)
    .map((i) => `- \`${i.m![1]}\` at \`${path}:${i.n}\``);

  const parts = [
    keyword
      ? `The code for **${keyword}** is in \`${path}:${start}-${end}\`.`
      : `The entry point is \`${path}:${start}-${end}\`. Everything else hangs off it.`,
  ];
  if (routes.length) parts.push(`Routes it sets up:\n${routes.join("\n")}`);
  if (modules.length && !keyword) {
    parts.push(
      `Modules it wires together:\n${modules.join("\n")}\n\nAsk about any of them to follow the flow further.`,
    );
  }
  if (doc.length)
    parts.push(
      `What the comments there say:\n${doc
        .slice(0, 8)
        .map((d) => `- ${d}`)
        .join("\n")}`,
    );
  if (definitions.length) parts.push(`Key definitions:\n${definitions.join("\n")}`);
  return parts.join("\n\n");
}

/* ---------- Product audience: plain language, references at the end ---------- */

function isProduct(prompt: LanguageModelV4Prompt) {
  return prompt.some(
    (m) => m.role === "system" && m.content.includes("The reader is a product manager"),
  );
}

/** Turns code-ish words into plain ones: `createOrder()` → "create order". */
export function humanize(text: string) {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\b(\w+)\(\)/g, "$1")
    .replace(/\b[a-z]+(?:[A-Z][a-z0-9]*)+\b/g, (word) =>
      word.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase(),
    )
    .replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (word) => word.replace(/_/g, " "));
}

function references(items: string[]) {
  return `\n\n**${REFERENCES_HEADING}**\n${items.map((item) => `- ${item}`).join("\n")}`;
}

const TAG_LABELS: Record<string, string> = {
  FIXME: "Known problem",
  BUG: "Known bug",
  HACK: "Temporary workaround",
  XXX: "Needs attention",
  TODO: "Planned improvement",
};

function productAnswer(
  toolName: string,
  value: Record<string, unknown>,
  question: string,
): Decision {
  switch (toolName) {
    case "readFile": {
      if (typeof value.error === "string")
        return { kind: "text", text: "I couldn't open that part of the code." };
      const path = value.path as string;
      const range = `\`${path}:${value.startLine}-${value.endLine}\``;
      const lines = numberedLines(value.content as string);
      const named = question.match(/((?:[\w@.-]+\/)+[\w@.-]+\.[a-z]+)/i)?.[1];
      const keyword = named ? null : pickKeyword(question);

      if (!keyword && !named) {
        // The entry point, for "how is this organised" questions.
        const areas = [
          ...new Set(
            lines
              .map(
                (l) =>
                  l.text.match(/\.(?:use|get|post|put|patch|delete)\(\s*["'`]\/([a-z-]+)/i)?.[1],
              )
              .filter((a): a is string => Boolean(a)),
          ),
        ];
        if (areas.length) {
          return {
            kind: "text",
            text:
              `The product is organised into ${areas.length} main areas: ${joinWords(areas)}. Each one handles a part of the customer's journey.\n\nAsk how any of them works, for example "How does ${areas.at(-1)} work?", and I'll walk you through the rules and steps.` +
              references([`${range} where the areas are set up`]),
          };
        }
      }

      const doc = docLines(lines);
      if (doc.length === 0) {
        return {
          kind: "text",
          text:
            `I found the part of the code that handles ${keyword ? `**${keyword}**` : "this"}, but it has no plain-language notes I can summarise without AI. With an AI key set, I can read the logic itself and explain it.` +
            references([range]),
        };
      }

      const [first, ...rest] = doc;
      const lead = first!.endsWith(":") ? humanize(first!) : null;
      const points = (lead ? rest : doc).map((line) =>
        /^\d+[.)]\s/.test(line) ? humanize(line) : `- ${humanize(line)}`,
      );
      return {
        kind: "text",
        text:
          `Here's how ${keyword ? `**${keyword}**` : "this part of the product"} works, based on the notes the developers left in the code.\n\n` +
          (lead ? `${lead}\n` : "") +
          points.join("\n") +
          references([`${range} ${keyword ?? ""}`.trim()]),
      };
    }

    case "findTodos": {
      const items = (value.items ?? []) as Array<Match & { tag: string; text: string }>;
      if (items.length === 0) {
        return {
          kind: "text",
          text: "The developers haven't left any notes about unfinished or risky work.",
        };
      }
      const rank = ["FIXME", "BUG", "HACK", "XXX", "TODO"];
      const top = [...items].sort((a, b) => rank.indexOf(a.tag) - rank.indexOf(b.tag)).slice(0, 6);
      return {
        kind: "text",
        text:
          `The developers left ${items.length} notes about unfinished or risky work. The ones most likely to affect customers come first:\n` +
          top.map((t) => `- **${TAG_LABELS[t.tag] ?? "Note"}:** ${humanize(t.text)}`).join("\n") +
          references(top.map((t) => `\`${t.path}:${t.line}\``)),
      };
    }

    case "getOverview": {
      const o = value as {
        name: string;
        description: string | null;
        entryPoints: string[];
        readme: { path: string; endLine: number; content: string } | null;
      };
      if (FLOW_QUESTION.test(question) && o.entryPoints[0]) {
        return {
          kind: "tool",
          toolName: "readFile",
          input: { path: o.entryPoints[0], startLine: 1, endLine: 80 },
        };
      }
      const intro = o.readme
        ? o.readme.content
            .split(/\n\s*\n/)
            .find((p) => p.trim() && !p.trim().startsWith("#") && !p.includes("```"))
        : null;
      const name = o.name.split("/").pop();
      const summary = intro
        ? humanize(intro.replace(/\s*\n\s*/g, " ").trim())
        : (o.description ?? "I couldn't find a description of this project.");
      return {
        kind: "text",
        text:
          `**${name}**: ${summary}` +
          `\n\nAsk me how any part of it works, for example the main customer journey or the business rules.` +
          (o.readme
            ? references([
                `\`${o.readme.path}:1-${Math.min(o.readme.endLine, 6)}\` project description`,
              ])
            : ""),
      };
    }

    default:
      return afterTool(toolName, value, question);
  }
}

function numberedLines(content: string) {
  return content.split("\n").map((l) => {
    const [num, ...rest] = l.split("| ");
    return { n: Number(num), text: rest.join("| ") };
  });
}

/** Lines of /** *\/ doc comments only (ordinary comments can contain anything). */
function docLines(lines: Array<{ text: string }>) {
  const doc: string[] = [];
  let inDoc = false;
  for (const { text } of lines) {
    const t = text.trim();
    if (t.startsWith("/**")) inDoc = true;
    if (inDoc) {
      const cleaned = t
        .replace(/^\/\*\*|\*\/$|^\*/g, "")
        .trim()
        .replace(/^[-*]\s+/, "");
      if (cleaned) doc.push(cleaned);
    }
    if (t.endsWith("*/")) inDoc = false;
  }
  return doc;
}

function joinWords(words: string[]) {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function lastUserText(prompt: LanguageModelV4Prompt) {
  const message = prompt.findLast((m) => m.role === "user");
  if (message?.role !== "user") return "";
  return message.content
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

let counter = 0;

function toContent(decision: Decision): LanguageModelV4Content {
  return decision.kind === "text"
    ? { type: "text", text: decision.text }
    : {
        type: "tool-call",
        toolCallId: `demo-call-${++counter}`,
        toolName: decision.toolName,
        input: JSON.stringify(decision.input),
      };
}

function finish(decision: Decision) {
  return { unified: decision.kind === "text" ? "stop" : "tool-calls", raw: undefined } as const;
}

function toStreamParts(decision: Decision): LanguageModelV4StreamPart[] {
  const parts: LanguageModelV4StreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (decision.kind === "text") {
    const id = `demo-text-${++counter}`;
    parts.push({ type: "text-start", id });
    for (const word of decision.text.match(/\S+\s*/g) ?? [])
      parts.push({ type: "text-delta", id, delta: word });
    parts.push({ type: "text-end", id });
  } else {
    parts.push(toContent(decision) as LanguageModelV4StreamPart);
  }
  parts.push({ type: "finish", usage: USAGE, finishReason: finish(decision) });
  return parts;
}
