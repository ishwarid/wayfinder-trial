/*
 * Citations: `path:line` or `path:start-end` references in the assistant's
 * answers.
 *
 * A citation is "verified" only if every cited line was actually returned to
 * the model by a tool earlier in the conversation (read, matched in a
 * search, listed as a TODO, or shown in the overview's README excerpt). This
 * catches invented locations without a second model call.
 */

export type Citation = { path: string; start: number; end: number };

/** Lines the tools have shown, per file. */
export type SeenLines = Map<string, Set<number>>;

const CITATION =
  /(?<![\w./@-])((?:[\w@.+-]+\/)*[\w@+-][\w@.+-]*\.[A-Za-z][A-Za-z0-9]*):(\d{1,6})(?:\s*[-–]\s*(\d{1,6}))?/g;

export type Segment =
  { kind: "text"; text: string } | { kind: "citation"; text: string; citation: Citation };

export function splitCitations(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    const index = match.index!;
    if (index > last) segments.push({ kind: "text", text: text.slice(last, index) });
    const a = Number(match[2]);
    const b = match[3] ? Number(match[3]) : a;
    segments.push({
      kind: "citation",
      text: match[0],
      citation: { path: match[1]!, start: Math.min(a, b), end: Math.max(a, b) },
    });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

export function parseCitations(text: string): Citation[] {
  return splitCitations(text).flatMap((s) => (s.kind === "citation" ? [s.citation] : []));
}

function mark(seen: SeenLines, path: string, from: number, to: number) {
  let lines = seen.get(path);
  if (!lines) seen.set(path, (lines = new Set()));
  for (let n = from; n <= to && n - from < 2_000; n++) lines.add(n);
}

/** Records what one tool call showed the model. Unknown tools are ignored. */
export function recordToolOutput(seen: SeenLines, toolName: string, output: unknown) {
  if (!output || typeof output !== "object") return;
  const o = output as Record<string, unknown>;

  switch (toolName) {
    case "readFile":
      if (
        typeof o.path === "string" &&
        typeof o.startLine === "number" &&
        typeof o.endLine === "number"
      ) {
        mark(seen, o.path, o.startLine, o.endLine);
      }
      break;
    case "searchCode":
    case "findTodos":
      for (const item of ((o.matches ?? o.items) as Array<{ path: string; line: number }>) ?? []) {
        mark(seen, item.path, item.line, item.line);
      }
      break;
    case "getOverview": {
      const readme = o.readme as { path: string; startLine: number; endLine: number } | null;
      if (readme) mark(seen, readme.path, readme.startLine, readme.endLine);
      break;
    }
  }
}

export function isVerified(citation: Citation, seen: SeenLines) {
  const lines = seen.get(citation.path);
  if (!lines) return false;
  for (let n = citation.start; n <= citation.end; n++) if (!lines.has(n)) return false;
  return true;
}

export function githubLineUrl(
  repo: { owner: string; repo: string; sha: string },
  { path, start, end }: Citation,
) {
  const lines = start === end ? `L${start}` : `L${start}-L${end}`;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.sha}/${encoded}#${lines}`;
}
