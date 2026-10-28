import type { ExplorerUIMessage } from "@/lib/agent/agent";
import { recordToolOutput, type SeenLines } from "@/lib/citations";
import { viewerUrl, type RepoLink } from "@/lib/links";

type Part = ExplorerUIMessage["parts"][number];

/** Every line any tool has shown the model in this conversation. */
export function seenLines(messages: ExplorerUIMessage[]): SeenLines {
  const seen: SeenLines = new Map();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type.startsWith("tool-") && "state" in part && part.state === "output-available") {
        recordToolOutput(seen, part.type.slice("tool-".length), part.output);
      }
    }
  }
  return seen;
}

export function textOf(message: ExplorerUIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n\n")
    .trim();
}

const plural = (n: number, word: string) =>
  n === 1 ? `${n} ${word}` : `${n} ${/(s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`}`;

/** One line of "what the agent did", in plain language. */
export function ToolActivity({ part, repo }: { part: Part; repo: RepoLink }) {
  if (!part.type.startsWith("tool-") || !("state" in part)) return null;
  const done = part.state === "output-available";
  const failed = part.state === "output-error";

  switch (part.type) {
    case "tool-getOverview":
      return (
        <Activity done={done}>
          {done ? "Looked at the project overview" : "Looking at the project overview"}
        </Activity>
      );

    case "tool-listFiles": {
      const where = part.input?.folder ? part.input.folder : "the repository";
      return (
        <Activity done={done}>
          {done
            ? `Listed ${plural(part.output.total, "file")} in ${where}`
            : `Listing files in ${where}`}
        </Activity>
      );
    }

    case "tool-readFile": {
      const path = part.input?.path ?? "a file";
      if (done && "path" in part.output && part.output.path) {
        const { path: p, startLine, endLine } = part.output;
        return (
          <Activity done>
            Read{" "}
            <a
              href={viewerUrl(repo, { path: p, start: startLine, end: endLine })}
              target="_blank"
              rel="noopener"
              className="text-ink-soft font-mono underline decoration-dotted underline-offset-4"
            >
              {p}:{startLine}-{endLine}
            </a>
          </Activity>
        );
      }
      if (done) return <Activity done>Couldn&apos;t find {path}</Activity>;
      return (
        <Activity done={false}>
          Reading <span className="font-mono">{path}</span>
        </Activity>
      );
    }

    case "tool-searchCode": {
      const text = part.input?.text;
      if (done) {
        return (
          <Activity done>
            Searched for <q className="font-mono">{text}</q>:{" "}
            {part.output.totalMatches === 0
              ? "no matches"
              : `${plural(part.output.totalMatches, "match")} in ${plural(part.output.filesMatched, "file")}`}
          </Activity>
        );
      }
      return (
        <Activity done={false}>
          Searching
          {text ? (
            <>
              {" "}
              for <q className="font-mono">{text}</q>
            </>
          ) : null}
        </Activity>
      );
    }

    case "tool-findTodos":
      return (
        <Activity done={done}>
          {done ? `Listed ${plural(part.output.total, "TODO comment")}` : "Finding TODO comments"}
        </Activity>
      );

    default:
      return failed ? <Activity done>A tool didn&apos;t work</Activity> : null;
  }
}

function Activity({ children, done }: { children: React.ReactNode; done: boolean }) {
  return (
    <p className="text-ink-muted flex items-center gap-2 text-sm">
      {done ? (
        <span aria-hidden className="bg-line size-1.5 shrink-0 rounded-full" />
      ) : (
        <span aria-hidden className="working-dot bg-route size-1.5 shrink-0 rounded-full" />
      )}
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
