import { Fragment, type ReactNode } from "react";
import { splitCitations, type Citation } from "@/lib/citations";

type RenderCitation = (citation: Citation, key: string) => ReactNode;

/**
 * Renders the Markdown subset models actually use (paragraphs, lists,
 * headings, bold, inline code, fenced code blocks), and turns `path:line`
 * references into citation chips.
 *
 * Model output is untrusted, so this builds React elements and never sets
 * HTML. Links and raw HTML show as plain text.
 */
export function RichText({
  text,
  renderCitation,
}: {
  text: string;
  renderCitation: RenderCitation;
}) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) code.push(lines[i++]!);
      i++;
      blocks.push(
        <pre
          key={blocks.length}
          className="bg-sunken border-line overflow-x-auto rounded-md border p-3 font-mono text-[13px] leading-relaxed [font-variant-ligatures:none]"
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const list = /^\s*([-*]|\d+[.)])\s+/;
    if (list.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && list.test(lines[i]!)) items.push(lines[i++]!.replace(list, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag
          key={blocks.length}
          className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}
        >
          {items.map((item, j) => (
            <li key={j}>
              <Inline
                text={item}
                renderCitation={renderCitation}
                prefix={`${blocks.length}-${j}`}
              />
            </li>
          ))}
        </Tag>,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !list.test(lines[i]!) &&
      !lines[i]!.trim().startsWith("```")
    ) {
      paragraph.push(lines[i++]!);
    }
    const joined = paragraph.join(" ");
    const heading = joined.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      <p key={blocks.length} className={heading ? "font-semibold" : undefined}>
        <Inline
          text={heading ? heading[1]! : joined}
          renderCitation={renderCitation}
          prefix={String(blocks.length)}
        />
      </p>,
    );
  }

  return <div className="space-y-3 leading-relaxed">{blocks}</div>;
}

function Inline({
  text,
  renderCitation,
  prefix,
}: {
  text: string;
  renderCitation: RenderCitation;
  prefix: string;
}) {
  // Split out `code` and **bold** first, then look for citations in each piece.
  const pieces = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {pieces.map((piece, i) => {
        const key = `${prefix}-${i}`;
        if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
          const inner = piece.slice(1, -1);
          const segments = splitCitations(inner);
          if (segments.length === 1 && segments[0]!.kind === "citation") {
            return <Fragment key={key}>{renderCitation(segments[0]!.citation, key)}</Fragment>;
          }
          return (
            <code key={key} className="bg-sunken rounded px-1 py-0.5 font-mono text-[0.9em]">
              {inner}
            </code>
          );
        }
        if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
          return (
            <strong key={key} className="font-semibold">
              <WithCitations
                text={piece.slice(2, -2)}
                renderCitation={renderCitation}
                prefix={key}
              />
            </strong>
          );
        }
        return (
          <WithCitations key={key} text={piece} renderCitation={renderCitation} prefix={key} />
        );
      })}
    </>
  );
}

function WithCitations({
  text,
  renderCitation,
  prefix,
}: {
  text: string;
  renderCitation: RenderCitation;
  prefix: string;
}) {
  return (
    <>
      {splitCitations(text).map((segment, i) =>
        segment.kind === "text" ? (
          <Fragment key={i}>{segment.text}</Fragment>
        ) : (
          <Fragment key={i}>{renderCitation(segment.citation, `${prefix}-c${i}`)}</Fragment>
        ),
      )}
    </>
  );
}
