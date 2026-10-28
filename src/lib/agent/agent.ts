import { isStepCount, ToolLoopAgent, type InferAgentUIMessage, type LanguageModel } from "ai";
import type { Audience } from "@/lib/constants";
import type { Snapshot } from "@/lib/repo/types";
import { explorerInstructions } from "./instructions";
import { createExplorerTools } from "./tools";

/** Exploring takes a few hops: overview, search, read, read again, answer. */
export const MAX_STEPS = 12;
export const MAX_OUTPUT_TOKENS = 1_200;

/**
 * The explorer agent for one repository snapshot. Used by the chat route,
 * the tests and the evals, so all three exercise the same configuration.
 */
export function createExplorerAgent({
  model,
  snapshot,
  audience = "product",
}: {
  model: LanguageModel;
  snapshot: Snapshot;
  audience?: Audience;
}) {
  return new ToolLoopAgent({
    model,
    instructions: explorerInstructions(snapshot, audience),
    tools: createExplorerTools(snapshot),
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.2,
  });
}

export type ExplorerAgent = ReturnType<typeof createExplorerAgent>;
export type ExplorerUIMessage = InferAgentUIMessage<ExplorerAgent>;
