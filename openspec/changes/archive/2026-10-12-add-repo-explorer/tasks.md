# Tasks

## 1. Repository loading

- [x] 1.1 Parse repository input in `src/lib/repo/parse.ts`; verify URL, `owner/repo`, branch and file URL cases with unit tests
- [x] 1.2 Build the snapshot pipeline (filters, binary detection, limits) in `src/lib/repo/snapshot.ts`; verify skips and limits with unit tests
- [x] 1.3 Implement redaction in `src/lib/repo/redact.ts`; verify each secret pattern is redacted with line numbers unchanged
- [x] 1.4 Extract tarballs in `src/lib/repo/tarball.ts`; verify with a tar.gz built in the test
- [x] 1.5 Implement the GitHub client and loader in `src/lib/github/client.ts` and `src/lib/repo/load.ts` (metadata, SHA, tarball, private-on-server-token rule); verify with mocked fetch
- [x] 1.6 Add the snapshot cache and access cache in `src/lib/repo/cache.ts`; verify LRU eviction and that access is checked on cache hits
- [x] 1.7 Create the sample repository in `evals/fixtures/tiny-shop/` and a local loader; verify it loads with the planted secret redacted and `.env` excluded

## 2. Tools, agent and citations

- [x] 2.1 Implement code tools in `src/lib/agent/tools.ts` (overview, list, read, search, todos) with output caps; verify against the sample repository
- [x] 2.2 Implement TODO detection in `src/lib/repo/todos.ts`; verify comments are found and strings ignored
- [x] 2.3 Write instructions and `createExplorerAgent` in `src/lib/agent/`; verify with the scripted model that answers use tools
- [x] 2.4 Implement provider selection and the scripted model in `src/lib/agent/model.ts` and `demo-model.ts`; verify selection rules with unit tests
- [x] 2.5 Implement citation parsing and verification in `src/lib/citations.ts`; verify verified and unverified cases

## 3. GitHub access and chat API

- [x] 3.1 Implement encrypted sessions in `src/lib/session.ts`; verify round trip, tampering and expiry
- [x] 3.2 Implement login, callback and logout routes in `src/app/api/auth/`; verify state checking and token exchange with mocked fetch
- [x] 3.3 Implement `POST /api/chat` in `src/app/api/chat/route.ts` via `src/lib/chat-handler.ts`: validation, limits, access check, streaming; verify refusals never call the model

## 4. Interface

- [x] 4.1 Build the landing page in `src/app/page.tsx` with repository input and sign-in state
- [x] 4.2 Build the workspace in `src/app/r/[owner]/[repo]/page.tsx` with loading and error states (not found, no access with install link, too large, rate limited)
- [x] 4.3 Build the chat in `src/components/chat/` with tool activity, citation chips, stop, errors and demo notice; verify with component tests
- [x] 4.4 Build the TODO board in `src/components/todo-board.tsx`; verify grouping and links in a component test

## 5. Evaluation and integration

- [x] 5.1 Write eval cases and the harness in `evals/`; verify they pass with the scripted model in Vitest and `npm run eval`
- [x] 5.2 Add CI in `.github/workflows/ci.yml`; verify each step passes locally
- [x] 5.3 Walk through landing, workspace, chat and TODO board in a browser against the sample repository; save screenshots in `docs/`
- [x] 5.4 Document setup (GitHub App, keys) and decisions in `README.md`

## Workflow follow-up

- Register the GitHub App, run the app against a real repository and run `npm run eval` with a real key.
- Archive the change with `openspec archive add-repo-explorer`.
