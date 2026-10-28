import { tool } from "ai";
import { z } from "zod";
import { buildOverview } from "@/lib/repo/overview";
import { findTodos, TODO_TAGS } from "@/lib/repo/todos";
import type { Snapshot } from "@/lib/repo/types";

export const READ_MAX_LINES = 300;
export const SEARCH_MAX_MATCHES = 40;
export const LIST_MAX_FILES = 200;
export const TODO_MAX_ITEMS = 100;

/**
 * The agent's only way to see the repository: read-only views over an
 * in-memory snapshot. There is deliberately no tool that runs code, writes
 * files or reaches the network, and every output is capped so a single call
 * can't flood the model's context.
 */
export function createExplorerTools(snapshot: Snapshot) {
  const lines = (path: string) => snapshot.files.get(path)!.split("\n");

  return {
    getOverview: tool({
      description:
        "Start here. Repository name, description, languages, frameworks, entry points, top-level folders, README and manifest file names, TODO count.",
      inputSchema: z.object({}),
      execute: async () => buildOverview(snapshot),
    }),

    listFiles: tool({
      description: `List file paths, optionally under a folder. Returns up to ${LIST_MAX_FILES} paths with line counts.`,
      inputSchema: z.object({
        folder: z.string().max(300).optional().describe('Folder prefix, for example "src/lib"'),
      }),
      execute: async ({ folder }) => {
        const prefix = folder ? folder.replace(/^\/+|\/+$/g, "") + "/" : "";
        const matching = [...snapshot.files.keys()].filter((p) => p.startsWith(prefix));
        return {
          total: matching.length,
          truncated: matching.length > LIST_MAX_FILES,
          files: matching
            .slice(0, LIST_MAX_FILES)
            .map((path) => ({ path, lines: lines(path).length })),
        };
      },
    }),

    readFile: tool({
      description: `Read a file, or a range of its lines. Returns at most ${READ_MAX_LINES} lines, each prefixed with its line number. Read narrow ranges when you can.`,
      inputSchema: z.object({
        path: z.string().max(300),
        startLine: z.number().int().min(1).optional(),
        endLine: z.number().int().min(1).optional(),
      }),
      execute: async ({ path, startLine = 1, endLine }) => {
        const clean = path.replace(/^\.?\//, "");
        if (!snapshot.files.has(clean)) {
          const name = clean.split("/").pop()!.toLowerCase();
          return {
            error: "File not found in this repository.",
            similar: [...snapshot.files.keys()]
              .filter((p) => p.toLowerCase().endsWith(name))
              .slice(0, 5),
          };
        }
        const all = lines(clean);
        const start = Math.min(startLine, all.length);
        const end = Math.min(
          endLine ?? start + READ_MAX_LINES - 1,
          start + READ_MAX_LINES - 1,
          all.length,
        );
        return {
          path: clean,
          startLine: start,
          endLine: end,
          totalLines: all.length,
          content: all
            .slice(start - 1, end)
            .map((text, i) => `${start + i}| ${text}`)
            .join("\n"),
        };
      },
    }),

    searchCode: tool({
      description: `Find exact text across all files (case-insensitive unless asked). Returns up to ${SEARCH_MAX_MATCHES} matching lines with paths and line numbers. Search for identifiers or short phrases, not sentences.`,
      inputSchema: z.object({
        text: z.string().min(2).max(100).describe("Literal text, not a regular expression"),
        folder: z.string().max(300).optional(),
        caseSensitive: z.boolean().optional(),
      }),
      execute: async ({ text, folder, caseSensitive = false }) => {
        // Literal matching only: a model-written regex could backtrack
        // catastrophically over megabytes of code and hang the function.
        const needle = caseSensitive ? text : text.toLowerCase();
        const prefix = folder ? folder.replace(/^\/+|\/+$/g, "") + "/" : "";
        const matches: Array<{ path: string; line: number; text: string }> = [];
        const files = new Set<string>();
        let total = 0;

        for (const [path, content] of snapshot.files) {
          if (!path.startsWith(prefix)) continue;
          const fileLines = content.split("\n");
          for (let i = 0; i < fileLines.length; i++) {
            const line = fileLines[i]!;
            if (!(caseSensitive ? line : line.toLowerCase()).includes(needle)) continue;
            total++;
            files.add(path);
            if (matches.length < SEARCH_MAX_MATCHES) {
              matches.push({ path, line: i + 1, text: line.trim().slice(0, 200) });
            }
          }
        }
        return {
          totalMatches: total,
          filesMatched: files.size,
          truncated: total > matches.length,
          matches,
        };
      },
    }),

    findTodos: tool({
      description:
        "List TODO, FIXME, HACK, XXX and BUG comments with file and line, optionally for one tag.",
      inputSchema: z.object({ tag: z.enum(TODO_TAGS).optional() }),
      execute: async ({ tag }) => {
        const all = findTodos(snapshot);
        const items = tag ? all.filter((t) => t.tag === tag) : all;
        const byTag = Object.fromEntries(
          TODO_TAGS.map((t) => [t, all.filter((i) => i.tag === t).length]),
        );
        return { total: items.length, byTag, items: items.slice(0, TODO_MAX_ITEMS) };
      },
    }),
  };
}

export type ExplorerTools = ReturnType<typeof createExplorerTools>;
