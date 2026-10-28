import type { OpenError } from "./load";

const time = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" });

/** What to tell the user when a repository can't be opened. */
export function describeOpenError(error: OpenError, { signedIn }: { signedIn: boolean }) {
  switch (error.kind) {
    case "not-found":
      return {
        status: 404,
        title: "Repository not found",
        message: signedIn
          ? "It doesn't exist, or Wayfinder hasn't been given access to it. For a private repository, add it to the Wayfinder app's access on GitHub."
          : "It doesn't exist, or it's private. Sign in with GitHub to open private repositories you have access to.",
      };
    case "unauthorized":
      // Without a user token, a 401 means the deployment's GITHUB_TOKEN was
      // rejected; it's not the visitor's session.
      if (!signedIn) {
        return {
          status: 502,
          title: "GitHub refused the request",
          message:
            "This deployment's GitHub credentials were rejected. Try again later, or sign in with GitHub.",
        };
      }
      return {
        status: 401,
        title: "Your GitHub session has expired",
        message: "Sign in again to keep exploring private repositories.",
      };
    case "rate-limited":
      return {
        status: 429,
        title: "GitHub's rate limit was reached",
        message: error.resetAt
          ? `Try again after ${time.format(error.resetAt)}. Signing in gives you a much higher limit.`
          : "Try again in a few minutes. Signing in gives you a much higher limit.",
      };
    case "too-large":
      return {
        status: 413,
        title: "This repository is too large",
        message:
          error.limit === "files"
            ? `Wayfinder reads up to ${error.max.toLocaleString("en-AU")} source files.`
            : `Wayfinder reads up to ${Math.round(error.max / 1024 / 1024)} MB of ${error.limit === "download" ? "download" : "source"}.`,
      };
    case "failed":
      return {
        status: 502,
        title: "GitHub didn't respond as expected",
        message: "Try again in a moment.",
      };
  }
}
