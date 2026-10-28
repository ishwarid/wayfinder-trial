# Proposal

## Why

Wayfinder's answers were written for developers: file paths and line numbers in every sentence,
code terms like "router" and "handler". A product manager, analyst or support lead asking "how
do discounts work?" needs the business rules in plain language, not a list of files. Without an
AI key, the scripted demo also only pointed at files, which made it look like the product
doesn't explain anything.

## What Changes

- Add an "Explain for: Product / Developer" choice in the workspace, defaulting to Product.
- Product answers explain in plain business language: what happens, the rules with their real
  numbers and conditions, flows as numbered steps from the user's point of view, and risks. Code
  terms and file names stay out of the main answer.
- Code references stay available in product answers, grouped at the end under "Where this lives
  in the code", still verified.
- In product mode, the agent's tool activity is collapsed into one line that can be expanded.
- The scripted demo writes plain-language answers from the code's own comments, and its notice
  says plainly that it isn't AI and how to turn real explanations on.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-chat`: answers adapt to the reader's role; the no-key notice explains what the scripted
  mode can and can't do.

## Impact

- `src/lib/agent/instructions.ts`, `agent.ts`, `demo-model.ts`: audience-aware instructions and
  scripted replies.
- `src/lib/chat-handler.ts`: accepts an `audience` field.
- `src/components/`: the audience switch, collapsed activity, revised notice.
- `evals/`: product-mode cases that check answers are free of code terms.
