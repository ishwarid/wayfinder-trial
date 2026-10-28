import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { createDemoModel } from "./demo-model";

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export type Provider = "gemini" | "groq" | "demo";
export type ModelChoice = {
  model: LanguageModel;
  provider: Provider;
  label: string;
  /** Set when a provider was asked for but its key is missing. */
  warning?: string;
};

/**
 * Picks the model from configuration:
 * - AI_PROVIDER=gemini|groq|demo chooses explicitly
 * - otherwise the first key that's set wins (Gemini, then Groq)
 * - with no key, the scripted demo model
 */
export function chooseModel(env: NodeJS.ProcessEnv = process.env): ModelChoice {
  const geminiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
  const groqKey = env.GROQ_API_KEY;
  const requested = env.AI_PROVIDER?.toLowerCase();

  const provider: Provider =
    requested === "gemini" || requested === "groq" || requested === "demo"
      ? requested
      : geminiKey
        ? "gemini"
        : groqKey
          ? "groq"
          : "demo";

  if (provider === "gemini" && geminiKey) {
    const id = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    return {
      model: createGoogleGenerativeAI({ apiKey: geminiKey })(id),
      provider,
      label: `gemini/${id}`,
    };
  }
  if (provider === "groq" && groqKey) {
    const id = env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    return { model: createGroq({ apiKey: groqKey })(id), provider, label: `groq/${id}` };
  }

  const warning =
    provider === "gemini"
      ? "AI_PROVIDER is gemini but GOOGLE_GENERATIVE_AI_API_KEY isn't set."
      : provider === "groq"
        ? "AI_PROVIDER is groq but GROQ_API_KEY isn't set."
        : undefined;
  return { model: createDemoModel(), provider: "demo", label: "scripted demo", warning };
}
