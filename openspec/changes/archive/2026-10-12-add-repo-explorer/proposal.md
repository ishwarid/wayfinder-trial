# Proposal

## Why

Joining a codebase is slow: before changing anything, a developer has to work out what the
project does, where the business rules live, how a request flows through it and what's
unfinished. Wayfinder lets anyone paste a GitHub repository and ask those questions in plain
language, with every answer pointing at the exact lines it came from. It does this without
running the code or its UI.

## What Changes

- Load any public GitHub repository by URL, and private repositories after the user signs in
  with GitHub and grants read-only access to the repositories they choose.
- Keep only readable source files, and redact secrets before anything is stored or shown to the
  model.
- Add a chat where an AI agent explores the repository with read-only tools (overview, file
  list, file reader, text search, TODO finder) and answers with citations to file and line.
  Citations are checked against what the tools returned.
- Add a TODO board that lists every TODO, FIXME, HACK, XXX and BUG comment with a link to its
  line, without using AI.
- Let the AI provider be Gemini or Groq on their free tiers, chosen by configuration, with a
  scripted model when no key is set.
- Add evaluations against a fixed sample repository, including prompt-injection and secret
  leakage cases.

## Capabilities

### New Capabilities

- `repo-loading`: turning a repository reference into a filtered, redacted, cached snapshot of
  its readable files
- `github-access`: signing in with GitHub, least-privilege access to private repositories, and
  access checks on every request
- `code-chat`: answering questions about a repository with read-only exploration tools and
  verified citations, inside usage limits
- `todo-board`: listing work-in-progress comments across a repository without AI
- `explorer-evaluation`: measuring the agent's answers, citations and safety against a fixed
  sample repository

### Modified Capabilities

None. This is the first change in the project.

## Impact

- New Next.js app: landing page, repository workspace, chat and auth API routes.
- New dependencies: AI SDK with Google and Groq providers, a tar parser, zod.
- New environment variables: `GOOGLE_GENERATIVE_AI_API_KEY` and/or `GROQ_API_KEY`,
  `AI_PROVIDER`, GitHub App credentials (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
  `GITHUB_APP_SLUG`), `SESSION_SECRET`, and an optional `GITHUB_TOKEN` for anonymous public
  browsing.
- Requires a GitHub App, registered by the deployer, with read-only Contents and Metadata
  permissions.
