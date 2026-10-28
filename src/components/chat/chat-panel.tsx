"use client";

import type { ChatStatus } from "ai";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CitationChip } from "@/components/citation-chip";
import type { ExplorerUIMessage } from "@/lib/agent/agent";
import { isVerified } from "@/lib/citations";
import { MAX_MESSAGE_LENGTH, type Audience } from "@/lib/constants";
import type { RepoLink } from "@/lib/links";
import type { ChatErrorView } from "./chat-error";
import { seenLines, textOf, ToolActivity } from "./message-parts";
import { RichText } from "./rich-text";

export const SUGGESTIONS: Record<Audience, string[]> = {
  product: [
    "What does this product do?",
    "Walk me through the main customer journey",
    "What are the main business rules?",
    "What unfinished work should I worry about?",
  ],
  developer: [
    "What does this project do?",
    "Walk me through the main flow",
    "Where is the core business logic?",
    "Which TODOs look risky?",
  ],
};

const AUDIENCE_OPTIONS: Array<{ value: Audience; label: string; hint: string }> = [
  { value: "product", label: "Product", hint: "Plain language, no code" },
  { value: "developer", label: "Developer", hint: "Files, functions and line numbers" },
];

export type ChatPanelProps = {
  repo: RepoLink;
  messages: ExplorerUIMessage[];
  status: ChatStatus;
  error: ChatErrorView | null;
  demoNotice: string | null;
  signInUrl: string | null;
  audience: Audience;
  onAudienceChange: (audience: Audience) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
};

/** The conversation. Plain props, no network: the container owns `useChat`. */
export function ChatPanel(props: ChatPanelProps) {
  const { repo, messages, status, error, demoNotice, signInUrl, audience } = props;
  const { onAudienceChange, onSend, onStop, onRetry } = props;
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const busy = status === "submitted" || status === "streaming";
  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const seen = useMemo(() => seenLines(messages), [messages]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, status]);

  function send(text: string) {
    if (!text.trim() || busy || text.length > MAX_MESSAGE_LENGTH) return;
    onSend(text.trim());
    setDraft("");
  }

  const lastAssistant = messages.findLast((m) => m.role === "assistant");
  const announcement = !busy && lastAssistant ? textOf(lastAssistant) : "";

  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col">
      {demoNotice && (
        <p className="bg-route-soft text-ink-soft px-4 py-2 text-xs sm:px-6">{demoNotice}</p>
      )}

      <div className="border-line flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 sm:px-6">
        <span id={`${id}-audience`} className="text-ink-muted text-sm">
          Explain for
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${id}-audience`}
          className="bg-sunken border-line flex rounded-lg border p-0.5"
        >
          {AUDIENCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={audience === option.value}
              onClick={() => onAudienceChange(option.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                audience === option.value
                  ? "bg-surface text-ink shadow-card"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-ink-muted text-xs">
          {AUDIENCE_OPTIONS.find((o) => o.value === audience)?.hint}
        </span>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="max-w-xl">
            <p className="text-lg font-semibold">What would you like to understand?</p>
            <p className="text-ink-soft mt-1 text-sm">
              {audience === "product"
                ? "Wayfinder reads the code and explains it in plain language, with references for engineers at the end."
                : "Wayfinder reads the code, then answers with links to the exact lines."}
            </p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Suggested questions">
              {SUGGESTIONS[audience].map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="border-line bg-surface hover:border-route h-full w-full rounded-lg border px-3 py-2.5 text-left text-sm"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) =>
              message.role === "user" ? (
                <li key={message.id} className="flex justify-end">
                  <p className="bg-ink text-surface max-w-[85%] rounded-2xl rounded-br-md px-4 py-2 whitespace-pre-wrap">
                    {textOf(message)}
                  </p>
                </li>
              ) : (
                <li key={message.id} className="space-y-2">
                  {audience === "product" && <ActivitySummary message={message} repo={repo} />}
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      part.text.trim() ? (
                        <RichText
                          key={i}
                          text={part.text}
                          renderCitation={(citation, key) => (
                            <CitationChip
                              key={key}
                              citation={citation}
                              repo={repo}
                              verified={isVerified(citation, seen)}
                            />
                          )}
                        />
                      ) : null
                    ) : audience === "developer" ? (
                      <ToolActivity key={i} part={part} repo={repo} />
                    ) : null,
                  )}
                </li>
              ),
            )}
            {status === "submitted" && (
              <li className="text-ink-muted flex items-center gap-2 text-sm">
                <span aria-hidden className="working-dot bg-route size-1.5 rounded-full" />
                Thinking
              </li>
            )}
          </ol>
        )}

        {error && (
          <div
            role="alert"
            className="border-danger/40 mx-auto mt-6 max-w-3xl rounded-lg border p-3 text-sm"
          >
            <p>{error.message}</p>
            {error.signIn && signInUrl ? (
              <a
                href={signInUrl}
                className="text-route-strong mt-2 inline-block font-semibold underline underline-offset-4"
              >
                Sign in again
              </a>
            ) : error.canRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="text-route-strong mt-2 font-semibold underline underline-offset-4"
              >
                Try again
              </button>
            ) : null}
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <form
        className="border-line bg-surface border-t px-4 py-3 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <div className="border-line focus-within:border-route mx-auto flex max-w-3xl items-end gap-2 rounded-xl border px-3 py-2 focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--route)_20%,transparent)]">
          <label htmlFor={`${id}-input`} className="sr-only">
            Ask about this repository
          </label>
          <textarea
            id={`${id}-input`}
            value={draft}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            }}
            placeholder={
              audience === "product"
                ? "Ask in your own words, for example: how do refunds work?"
                : "Ask how something works, where it lives, or what's unfinished"
            }
            className="placeholder:text-ink-muted [field-sizing:content] max-h-40 min-h-6 flex-1 resize-none bg-transparent outline-none focus-visible:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="bg-ink text-surface h-8 shrink-0 rounded-lg px-3 text-sm font-semibold"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim() || tooLong}
              className="bg-route text-on-route h-8 shrink-0 rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
            >
              Ask
            </button>
          )}
        </div>
        {draft.length > MAX_MESSAGE_LENGTH * 0.8 && (
          <p
            className={`mx-auto mt-1 max-w-3xl text-right text-xs ${tooLong ? "text-danger" : "text-ink-muted"}`}
          >
            {draft.length.toLocaleString("en-AU")} / {MAX_MESSAGE_LENGTH.toLocaleString("en-AU")}
          </p>
        )}
      </form>
    </section>
  );
}

/**
 * Product mode: one collapsed line instead of every search and read. The
 * steps are still there for anyone who wants to see how the answer was found.
 */
function ActivitySummary({ message, repo }: { message: ExplorerUIMessage; repo: RepoLink }) {
  const tools = message.parts.filter((part) => part.type.startsWith("tool-") && "state" in part);
  if (tools.length === 0) return null;

  const working = tools.some(
    (part) => "state" in part && part.state !== "output-available" && part.state !== "output-error",
  );
  const count = (type: string) => tools.filter((part) => part.type === type).length;
  const searches = count("tool-searchCode");
  const reads = count("tool-readFile");
  const summary = [
    searches && `${searches} ${searches === 1 ? "search" : "searches"}`,
    reads && `${reads} ${reads === 1 ? "file" : "files"} read`,
    count("tool-findTodos") && "notes listed",
    count("tool-getOverview") && "overview",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <details className="text-ink-muted text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${working ? "working-dot bg-route" : "bg-line"}`}
        />
        {working ? "Checking the code" : `Checked the code: ${summary}`}
        <span className="underline decoration-dotted underline-offset-4">How I found this</span>
      </summary>
      <div className="mt-2 space-y-1 pl-3.5">
        {tools.map((part, i) => (
          <ToolActivity key={i} part={part} repo={repo} />
        ))}
      </div>
    </details>
  );
}
