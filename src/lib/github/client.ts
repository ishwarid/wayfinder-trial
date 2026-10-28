/*
 * The handful of GitHub REST calls Wayfinder needs. Every call takes the
 * token explicitly, so it's always clear whose credentials are in use.
 */

const API = "https://api.github.com";

export type RepoMeta = {
  owner: string;
  repo: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  /** Size in KB, as GitHub reports it. */
  sizeKb: number;
};

export type GitHubError =
  | { kind: "not-found" }
  | { kind: "unauthorized" }
  | { kind: "rate-limited"; resetAt: Date | null }
  | { kind: "failed"; status: number };

export type GitHubResult<T> = { ok: true; value: T } | { ok: false; error: GitHubError };

export function createGitHubClient({
  token,
  fetch: fetchImpl = fetch,
}: {
  token?: string;
  fetch?: typeof fetch;
}) {
  async function request(path: string, accept = "application/vnd.github+json") {
    try {
      return await fetchImpl(`${API}${path}`, {
        headers: {
          Accept: accept,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "repo-wayfinder",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
      });
    } catch (error) {
      // Network failures become an ordinary "GitHub didn't respond" error
      // instead of crashing the page.
      console.error("[github] request failed", path, error);
      return new Response(null, { status: 503 });
    }
  }

  const enc = encodeURIComponent;

  return {
    async getRepo(owner: string, repo: string): Promise<GitHubResult<RepoMeta>> {
      const response = await request(`/repos/${enc(owner)}/${enc(repo)}`);
      if (!response.ok) return { ok: false, error: toError(response) };
      const data = await response.json();
      return {
        ok: true,
        value: {
          owner: data.owner.login,
          repo: data.name,
          isPrivate: Boolean(data.private),
          defaultBranch: data.default_branch,
          description: data.description ?? null,
          htmlUrl: data.html_url,
          sizeKb: data.size ?? 0,
        },
      };
    },

    /** Resolves a branch, tag or short SHA to a full commit SHA. */
    async resolveCommit(owner: string, repo: string, ref: string): Promise<GitHubResult<string>> {
      const response = await request(
        `/repos/${enc(owner)}/${enc(repo)}/commits/${enc(ref)}`,
        "application/vnd.github.sha",
      );
      if (!response.ok) return { ok: false, error: toError(response) };
      const sha = (await response.text()).trim();
      return /^[0-9a-f]{40}$/.test(sha)
        ? { ok: true, value: sha }
        : { ok: false, error: { kind: "failed", status: response.status } };
    },

    /** The commit's tarball. GitHub redirects to a short-lived download URL. */
    async downloadTarball(
      owner: string,
      repo: string,
      sha: string,
    ): Promise<GitHubResult<ReadableStream<Uint8Array>>> {
      const response = await request(`/repos/${enc(owner)}/${enc(repo)}/tarball/${sha}`);
      if (!response.ok || !response.body) return { ok: false, error: toError(response) };
      return { ok: true, value: response.body };
    },

    async getUser(): Promise<GitHubResult<{ login: string; avatarUrl: string }>> {
      const response = await request("/user");
      if (!response.ok) return { ok: false, error: toError(response) };
      const data = await response.json();
      return { ok: true, value: { login: data.login, avatarUrl: data.avatar_url } };
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;

function toError(response: Response): GitHubError {
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 429 || (response.status === 403 && remaining === "0")) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    return { kind: "rate-limited", resetAt: reset ? new Date(reset * 1000) : null };
  }
  if (response.status === 401) return { kind: "unauthorized" };
  // GitHub answers 404 (not 403) for private repos you can't see, so
  // "doesn't exist" and "no access" are deliberately indistinguishable.
  if (response.status === 404 || response.status === 403) return { kind: "not-found" };
  return { kind: "failed", status: response.status };
}
