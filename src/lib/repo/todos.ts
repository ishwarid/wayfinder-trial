import type { Snapshot } from "./types";

export const TODO_TAGS = ["FIXME", "BUG", "HACK", "XXX", "TODO"] as const;
export type TodoTag = (typeof TODO_TAGS)[number];

export type TodoItem = { path: string; line: number; tag: TodoTag; text: string };

const MARKER = /\b(TODO|FIXME|HACK|XXX|BUG)\b/;

// Languages where "#" starts a comment. In JS/TS it's a private field.
const HASH_COMMENTS = new Set(
  "py rb sh bash zsh yaml yml toml r pl ex exs tf conf cfg gitignore dockerfile makefile".split(
    " ",
  ),
);
const DASH_COMMENTS = new Set(["sql", "lua", "hs"]);

function languageOf(path: string) {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile" || name === "makefile") return name;
  return name.includes(".") ? name.split(".").pop()! : name;
}

/**
 * Finds work-in-progress markers in comments, not in strings or code.
 *
 * It's a small scanner rather than a regex: it tracks quotes and /* *\/
 * blocks, so `const label = "TODO list"` isn't reported but a TODO inside
 * a multi-line comment is.
 */
export function findTodosInFile(path: string, content: string): TodoItem[] {
  const lang = languageOf(path);
  const hash = HASH_COMMENTS.has(lang);
  const dash = DASH_COMMENTS.has(lang);
  const items: TodoItem[] = [];
  let inBlock = false;

  content.split("\n").forEach((line, index) => {
    const commentStart = findCommentStart(line, { inBlock, hash, dash });
    inBlock = commentStart.inBlockAfter;
    if (commentStart.index === -1) return;

    const comment = line.slice(commentStart.index);
    const match = comment.match(MARKER);
    if (!match) return;

    const text = comment
      .slice(match.index! + match[0].length)
      .replace(/^\s*(\([^)]*\))?\s*[:\-]?\s*/, "")
      .replace(/\s*(\*\/|-->)\s*$/, "")
      .trim();
    items.push({
      path,
      line: index + 1,
      tag: match[1] as TodoTag,
      text: text || "(no description)",
    });
  });

  return items;
}

function findCommentStart(
  line: string,
  { inBlock, hash, dash }: { inBlock: boolean; hash: boolean; dash: boolean },
): { index: number; inBlockAfter: boolean } {
  let quote: string | null = null;
  let start = inBlock ? 0 : -1;
  let blockOpen = inBlock;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const two = line.slice(i, i + 2);

    if (blockOpen) {
      if (two === "*/" || line.startsWith("-->", i)) blockOpen = false;
      continue;
    }
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (two === "//" || (hash && ch === "#") || (dash && two === "--")) {
      return { index: start === -1 ? i : start, inBlockAfter: false };
    }
    if (two === "/*" || line.startsWith("<!--", i)) {
      if (start === -1) start = i;
      blockOpen = true;
      i++;
    }
  }
  return { index: start, inBlockAfter: blockOpen };
}

const cache = new WeakMap<Snapshot, TodoItem[]>();

export function findTodos(snapshot: Snapshot): TodoItem[] {
  let items = cache.get(snapshot);
  if (!items) {
    items = [...snapshot.files].flatMap(([path, content]) =>
      path.endsWith(".md") && !content.includes("<!--") ? [] : findTodosInFile(path, content),
    );
    cache.set(snapshot, items);
  }
  return items;
}
