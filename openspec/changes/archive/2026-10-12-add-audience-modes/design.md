# Design

## Context

See proposal.md. The agent, tools and citation verification are unchanged; this is about who the
answer is written for.

## Goals / Non-Goals

**Goals:** plain-language answers for non-technical readers without losing verifiability.

**Non-Goals:** per-user saved preferences, translations, diagrams.

## Decisions

### Audience is a per-request parameter, not a separate agent

The chat request carries `audience: "product" | "developer"`, and `createExplorerAgent` builds
the same tools with audience-specific instructions. Exploration is identical, so evals compare
like with like; only the writing changes.

- Alternative: a second "translate for PMs" model call after the developer answer. Rejected: it
  doubles token use on free tiers and the rewrite can drift from what the code says.

### Citations move, they don't disappear

Product answers end with "Where this lives in the code", parsed and verified exactly like inline
citations. Engineers reading a PM's shared answer can still check it.

### Deterministic eval for "no jargon"

Product-mode eval cases split the reply at "Where this lives in the code" and fail if the body
contains a file path or a code-style identifier (camelCase, snake_case or backticked code).

## Risks / Trade-offs

- [Simplified answers can blur important edge cases] → Instructions require concrete values and
  conditions, and to mention exceptions; the judge checks rules are stated accurately.
- [Scripted mode can't truly explain] → The notice says so and how to enable AI.
