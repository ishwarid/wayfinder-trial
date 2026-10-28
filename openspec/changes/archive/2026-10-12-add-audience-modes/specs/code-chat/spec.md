# Spec Delta

## ADDED Requirements

### Requirement: Answers adapt to the reader

The user SHALL be able to choose whether answers are written for a product audience or for
developers, with product as the default. The choice SHALL apply to every later answer in the
conversation until changed.

#### Scenario: Switching to developer answers

- **WHEN** the user selects "Developer" and asks a question
- **THEN** the answer uses code terms and cites files inline

### Requirement: Product answers are in plain language

In product mode, the main answer SHALL explain behaviour in plain business language: what
happens, the rules with their actual values and conditions, flows as numbered steps from the
user's point of view, and notable risks. It SHALL NOT include file paths, function or variable
names, or code jargon in the main text.

#### Scenario: Product manager asks about discounts

- **WHEN** a product-mode user asks "How do discounts work?" in a repository with discount rules
- **THEN** the answer states the rules and their values in plain sentences
- **AND** no file path or code identifier appears before the code references section

### Requirement: Product answers keep verifiable code references

Product answers SHALL end with a short "Where this lives in the code" section listing verified
citations, so engineers can check the answer.

#### Scenario: References at the end

- **WHEN** a product-mode answer is based on code the agent read
- **THEN** the citations appear only in a final "Where this lives in the code" section

### Requirement: Product mode keeps the agent's work out of the way

In product mode, the agent's individual tool steps SHALL be summarised in one collapsed line that
can be expanded to see each step.

#### Scenario: Seeing how the answer was found

- **WHEN** a product-mode user expands the activity summary
- **THEN** each search and file read is listed

## MODIFIED Requirements

### Requirement: Works without an AI key

When no AI key is configured, the chat SHALL use a scripted model and say so. The notice SHALL
make clear that scripted replies are assembled from the code's comments and structure rather than
understood by AI, and SHALL say how to enable real explanations.

#### Scenario: No key

- **WHEN** the app runs without an AI key
- **THEN** the chat shows that replies are scripted, not AI
- **AND** it says that adding a free Gemini or Groq key enables real explanations
