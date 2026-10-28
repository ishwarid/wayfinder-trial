# Design

## Context

Greenfield Next.js app on Vercel's free tier: serverless, no database, functions limited in time
and memory. Models are free-tier Gemini or Groq, so tokens per request and requests per minute
are scarce. Repository content and user messages are untrusted. See proposal.md for motivation
and the specs for behaviour.

## Goals / Non-Goals

**Goals:**

- The agent never runs code and can only read; safety doesn't rely on the prompt.
- No one can read a private repository they lack access to, including through the cache.
- The same agent and tools run in the app, the tests and the evals.

**Non-Goals:**

- Indexing with embeddings, cross-repository search, or very large monorepos.
- Persisted chat history or accounts beyond the GitHub session cookie.
- GitLab or Bitbucket.

## Decisions

### Snapshot from one tarball request

Load a repository by resolving the ref to a commit SHA, then downloading that commit's tarball
and extracting it in memory with a streaming tar parser.

- One API call per repository instead of one per file, which matters with GitHub's rate limits.
- Alternative: Git Trees API plus fetching blobs on demand. Rejected: text search needs every
  file anyway, and hundreds of blob requests would exhaust the rate limit.
- Filters and redaction run during extraction, so skipped files and secrets are never held.
  The same pipeline loads the local fixture repository for tests and evals.

### Cache by commit, check access every time

Snapshots are cached in memory, keyed by `owner/repo@sha`, with a small LRU limit. Before any
cached snapshot is used, the request re-checks that the current user can read the repository.

- Content is immutable per SHA, so the cache is always correct, and sharing it between users is
  safe only because access is checked first.
- Access results are cached for 5 minutes per (token hash, repository) to save API calls.
- On serverless, each instance has its own cache, so a cold instance downloads again. That's
  acceptable at demo scale.

### GitHub App with user-to-server tokens

Sign-in uses a GitHub App's OAuth flow. The app is registered with read-only Contents and
Metadata permissions; the user chooses which repositories to install it on.

- Alternative: an OAuth App. Rejected: its only scope for private code is `repo`, which grants
  write access to every repository the user can reach.
- The flow uses a random `state` stored in a short-lived HTTP-only cookie to stop forged
  callbacks.
- User tokens expire after 8 hours. When one expires, the user is asked to sign in again
  instead of storing refresh tokens.

### Session in an encrypted cookie

The session (token, login, avatar, expiry) is encrypted with AES-256-GCM using a key derived
from `SESSION_SECRET`. GCM's authentication tag makes any tampering fail decryption.

- Alternative: a session table. Rejected to stay database-free.

### Server token for public browsing, restricted to public

Anonymous GitHub API calls are limited to 60 per hour per IP, and a Vercel deployment shares IPs.
An optional `GITHUB_TOKEN` (a fine-grained token with public-repository read access only) raises
that for signed-out users.

- Defence in depth: when the server token is used, any repository reported as private is
  treated as not found, even if the token could somehow see it.

### Literal search only

`searchCode` matches literal text, case-insensitively, optionally restricted to a path prefix,
returning at most 40 matches.

- Alternative: regular expressions. Rejected: a model-chosen pattern could cause catastrophic
  backtracking over megabytes of code and block the function.

### Citations verified against tool output

The model cites as `path:line` or `path:start-end`. The client marks a citation verified only if
those lines were returned by `readFile` or matched by `searchCode` earlier in the conversation,
and links verified citations to `github.com/<owner>/<repo>/blob/<sha>/<path>#L<start>-L<end>`.

- This catches made-up locations without a second model call.

### Provider switch

`AI_PROVIDER` selects `gemini` (default model `gemini-flash-latest`), `groq` (default
`llama-3.3-70b-versatile`) or `demo`. Without it, the first configured key wins, and with no
key the scripted model is used.

### Agent limits

The agent may take up to 12 steps per reply. Outputs are capped: `readFile` at 300 lines,
`searchCode` at 40 matches, `listFiles` at 200 entries, overview README at 3,000 characters.
Only the last 8 UI messages are sent to the model.

## Risks / Trade-offs

- [Free-tier token limits on large questions] → Capped tool outputs and history; the agent is
  told to read narrow line ranges; provider 429s are shown as "busy, try again".
- [Snapshot memory on large repositories] → Hard caps on file count, file size and total bytes,
  refused with a clear message.
- [Redaction misses an unusual secret format] → It's a best-effort second line of defence. The
  real protection is that users only load repositories they can already read.
- [In-memory caches and limits aren't shared across instances] → Documented; swap for Redis in
  production behind the same interfaces.
- [Model ignores tool results and invents locations] → Citation verification shows it to the
  user; evals measure it.
