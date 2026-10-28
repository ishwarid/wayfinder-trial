import { randomUUID } from "node:crypto";
import {
  APICallError,
  createAgentUIStreamResponse,
  safeValidateUIMessages,
  type LanguageModel,
} from "ai";
import { z } from "zod";
import { createExplorerAgent, type ExplorerUIMessage } from "@/lib/agent/agent";
import { createExplorerTools } from "@/lib/agent/tools";
import { AUDIENCES, HISTORY_LIMIT, MAX_MESSAGE_LENGTH } from "@/lib/constants";
import type { Limiter } from "@/lib/limits";
import { describeOpenError } from "@/lib/repo/errors";
import type { OpenResult } from "@/lib/repo/load";
import { createSnapshotBuilder } from "@/lib/repo/snapshot";
import type { RepoRef } from "@/lib/repo/types";
import { cookie, readCookie } from "@/lib/session";

export const VISITOR_COOKIE = "wf-visitor";
const VISITOR_ID = /^[0-9a-f-]{36}$/;

const Body = z.object({
  owner: z.string().min(1).max(39),
  repo: z.string().min(1).max(100),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  audience: z.enum(AUDIENCES).default("product"),
  messages: z.array(z.unknown()).min(1),
});

export type ChatDeps = {
  model: LanguageModel;
  open: (ref: RepoRef, userToken: string | undefined) => Promise<OpenResult>;
  userToken: string | undefined;
  dailyLimiter: Limiter;
  globalLimiter: Limiter;
};

// Tool schemas don't depend on the repository, so an empty snapshot is
// enough to validate tool parts before doing any real work.
const schemaTools = createExplorerTools(
  createSnapshotBuilder().finish({
    owner: "x",
    repo: "x",
    sha: "0".repeat(40),
    ref: "x",
    isPrivate: false,
    description: null,
    source: "sample",
  }),
);

/**
 * One chat turn. Every refusal (bad input, too long, over a limit, no access
 * to the repository) happens before the model is called.
 */
export async function handleChat(request: Request, deps: ChatDeps): Promise<Response> {
  const existing = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
  const visitorId = existing && VISITOR_ID.test(existing) ? existing : randomUUID();
  const setVisitor =
    visitorId === existing
      ? undefined
      : cookie(VISITOR_COOKIE, visitorId, { maxAge: 60 * 60 * 24 * 365 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return json(400, { error: "invalid-request", message: "That request couldn't be read." });
  const { owner, repo, sha, audience } = parsed.data;

  const validated = await safeValidateUIMessages<ExplorerUIMessage>({
    messages: parsed.data.messages,
    tools: schemaTools,
  });
  if (!validated.success)
    return json(400, { error: "invalid-request", message: "That message couldn't be read." });
  const messages = validated.data;

  const text = messages
    .at(-1)!
    .parts.map((part) => (part.type === "text" ? part.text : ""))
    .join("");
  if (text.length > MAX_MESSAGE_LENGTH) {
    return json(413, {
      error: "too-long",
      message: `Messages can be up to ${MAX_MESSAGE_LENGTH.toLocaleString("en-AU")} characters.`,
    });
  }

  const daily = deps.dailyLimiter.take(visitorId);
  if (!daily.ok) {
    return json(429, {
      error: "daily-limit",
      message: "You've reached today's message limit for this demo.",
      resetAt: daily.resetAt.toISOString(),
    });
  }
  if (!deps.globalLimiter.take("all").ok) {
    return json(429, {
      error: "busy",
      message: "Wayfinder is busy right now. Try again in a minute.",
    });
  }

  // Access is checked here, on every turn, with this user's credentials.
  const opened = await deps.open({ owner, repo, ref: sha }, deps.userToken);
  if (!opened.ok) {
    const view = describeOpenError(opened.error, { signedIn: Boolean(deps.userToken) });
    return json(view.status, {
      error: opened.error.kind,
      message: `${view.title}. ${view.message}`,
    });
  }

  const agent = createExplorerAgent({ model: deps.model, snapshot: opened.snapshot, audience });
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages.slice(-HISTORY_LIMIT),
    abortSignal: request.signal,
    headers: setVisitor ? { "Set-Cookie": setVisitor } : undefined,
    onError: streamErrorMessage,
  });
}

export function streamErrorMessage(error: unknown) {
  console.error("[chat] stream error", error);
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return "The AI provider's free-tier limit was reached. Try again in a minute.";
  }
  return "Something went wrong while answering. Try again.";
}

function json(status: number, body: Record<string, string>) {
  return Response.json(body, { status });
}
