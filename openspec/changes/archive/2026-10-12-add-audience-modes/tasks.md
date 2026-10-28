# Tasks

## 1. Agent

- [x] 1.1 Add audience-specific instructions in `src/lib/agent/instructions.ts` and pass audience through `createExplorerAgent`; verify with a unit test that product instructions forbid file names in the body
- [x] 1.2 Make the scripted model in `src/lib/agent/demo-model.ts` write plain-language product answers with references at the end; verify with agent tests for discounts, checkout and TODOs

## 2. API

- [x] 2.1 Accept `audience` in `src/lib/chat-handler.ts` (default product) and reject invalid values; verify in route tests

## 3. Interface

- [x] 3.1 Add the "Explain for" switch in `src/components/workspace.tsx` and send it with each request from `explorer-chat.tsx`; verify in a component test
- [x] 3.2 Collapse tool activity in product mode in `src/components/chat/chat-panel.tsx`; verify in a component test
- [x] 3.3 Rewrite the demo notice in `src/lib/repo-page.ts`; verify by screenshot

## 4. Evaluation

- [x] 4.1 Add product-mode cases and the no-jargon check in `evals/`; verify they pass in `npm test` and `npm run eval`
