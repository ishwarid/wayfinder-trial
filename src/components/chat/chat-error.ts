export type ChatErrorView = { message: string; canRetry: boolean; signIn?: boolean };

const time = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  weekday: "long",
});

/**
 * Turns a failed request into a message. Refusals from our API arrive as
 * JSON in the response body; everything else is a network or model failure.
 */
export function describeChatError(error: unknown): ChatErrorView {
  const body = readBody(error);
  switch (body?.error) {
    case "daily-limit": {
      const reset = body.resetAt ? new Date(body.resetAt) : null;
      return {
        message: `You've reached today's message limit for this demo.${reset && !Number.isNaN(reset.getTime()) ? ` It resets ${time.format(reset)}.` : ""}`,
        canRetry: false,
      };
    }
    case "unauthorized":
      return {
        message: body.message ?? "Your GitHub session has expired.",
        canRetry: false,
        signIn: true,
      };
    case "too-long":
    case "not-found":
    case "too-large":
      return { message: body.message ?? "That request was refused.", canRetry: false };
    case "busy":
    case "rate-limited":
    case "failed":
    case "invalid-request":
      return { message: body.message ?? "Something went wrong. Try again.", canRetry: true };
  }
  if (
    error instanceof Error &&
    /try again/i.test(error.message) &&
    !error.message.trim().startsWith("{")
  ) {
    return { message: error.message, canRetry: true };
  }
  return { message: "Something went wrong. Check your connection and try again.", canRetry: true };
}

type Body = { error?: string; message?: string; resetAt?: string };

function readBody(error: unknown): Body | null {
  if (!error || typeof error !== "object") return null;
  const raw =
    "responseBody" in error && typeof error.responseBody === "string"
      ? error.responseBody
      : error instanceof Error
        ? error.message
        : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
