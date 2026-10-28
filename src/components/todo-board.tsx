import { CitationChip } from "@/components/citation-chip";
import type { RepoLink } from "@/lib/links";
import { TODO_TAGS, type TodoItem, type TodoTag } from "@/lib/repo/todos";

const TAG_HINTS: Record<TodoTag, string> = {
  FIXME: "Known to be broken",
  BUG: "Known bugs",
  HACK: "Workarounds",
  XXX: "Needs attention",
  TODO: "Planned work",
};

/** Every work-in-progress comment, grouped by how worrying the tag usually is. No AI involved. */
export function TodoBoard({ items, repo }: { items: TodoItem[]; repo: RepoLink }) {
  if (items.length === 0) {
    return (
      <p className="text-ink-soft px-4 py-8 sm:px-6">
        No TODO, FIXME, HACK, XXX or BUG comments in this repository.
      </p>
    );
  }

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <p className="text-ink-soft text-sm">
        Found by scanning comments, without AI. Ordered with the riskiest tags first.
      </p>
      {TODO_TAGS.map((tag) => {
        const group = items.filter((item) => item.tag === tag);
        if (group.length === 0) return null;
        return (
          <section key={tag} aria-labelledby={`todo-${tag}`}>
            <h3 id={`todo-${tag}`} className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold">{tag}</span>
              <span className="text-ink-muted text-sm">
                {TAG_HINTS[tag]}, {group.length}
              </span>
            </h3>
            <ul className="divide-line border-line mt-2 divide-y border-y">
              {group.map((item) => (
                <li
                  key={`${item.path}:${item.line}`}
                  className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="min-w-0 flex-1">{item.text}</span>
                  <CitationChip
                    citation={{ path: item.path, start: item.line, end: item.line }}
                    repo={repo}
                    verified
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
