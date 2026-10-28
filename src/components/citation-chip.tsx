import type { Citation } from "@/lib/citations";
import { viewerUrl, type RepoLink } from "@/lib/links";

export function formatCitation({ path, start, end }: Citation) {
  return start === end ? `${path}:${start}` : `${path}:${start}-${end}`;
}

/**
 * A link to exact lines at the pinned commit. Verified chips are lines the
 * agent actually saw; unverified ones are flagged for the reader to check.
 * Opens in a new tab so the conversation stays put.
 */
export function CitationChip({
  citation,
  repo,
  verified,
}: {
  citation: Citation;
  repo: RepoLink;
  verified: boolean;
}) {
  const label = formatCitation(citation);
  return (
    <a
      href={viewerUrl(repo, citation)}
      target="_blank"
      rel="noopener"
      title={
        verified
          ? "Wayfinder read these lines in this chat"
          : "Wayfinder didn't read these lines in this chat. Check them yourself."
      }
      className={
        verified
          ? "bg-route-soft text-route-strong hover:border-route mx-0.5 inline-flex items-center gap-1 rounded border border-transparent px-1.5 py-px align-baseline font-mono text-[0.82em] break-all"
          : "border-check-line bg-check-bg text-check-ink mx-0.5 inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-px align-baseline font-mono text-[0.82em] break-all"
      }
    >
      {verified ? (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0">
          <path d="M1.5 5.5 4 8l4.5-6" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      ) : null}
      {label}
      <span className="sr-only">{verified ? ", verified" : ", not verified"}</span>
    </a>
  );
}
