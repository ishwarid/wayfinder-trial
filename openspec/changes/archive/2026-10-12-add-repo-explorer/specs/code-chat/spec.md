# Spec Delta

## Purpose

Lets a user ask questions about a repository in plain language (what it does, where business
rules live, how a flow works) and get answers grounded in the code, with checkable citations.

## ADDED Requirements

### Requirement: Answers come from exploring the code

The assistant SHALL answer questions about the repository by using its read-only tools to look
at the code first, and SHALL say when it couldn't find something rather than guessing.

#### Scenario: Business logic question

- **WHEN** the user asks where discounts are calculated in a repository with a discounts module
- **THEN** the assistant searches or reads the code and names the file and function

#### Scenario: Not in the repository

- **WHEN** the user asks about a feature the code doesn't contain
- **THEN** the assistant says it couldn't find it in the repository

### Requirement: Tools are read-only and bounded

The assistant SHALL only be able to view the overview, list files, read line ranges, search text
and list TODOs. It SHALL NOT execute code, write files or make network requests. Each tool's
output SHALL be capped in size.

#### Scenario: Reading a large file

- **WHEN** the assistant reads a 2,000-line file
- **THEN** it receives at most 300 lines per call, with the file's total line count

### Requirement: Citations point to exact lines and are verified

Answers SHALL cite code as file path and line or line range. A citation SHALL be shown as
verified, linking to those lines at the loaded commit on GitHub, only when the lines were
returned by a tool in the conversation. Otherwise it SHALL be marked as unverified.

#### Scenario: Verified citation

- **WHEN** the assistant read lines 10–40 of `src/lib/discounts.ts` and cites `src/lib/discounts.ts:12-20`
- **THEN** the citation links to those lines on GitHub at the loaded commit

#### Scenario: Unverified citation

- **WHEN** the assistant cites a file or line it never looked at
- **THEN** the citation is shown as unverified and isn't presented as a fact-checked link

### Requirement: Repository content is never treated as instructions

Text inside the repository SHALL be treated as data. Instructions found in code, comments or
documentation SHALL NOT change the assistant's behaviour.

#### Scenario: Injection in a comment

- **WHEN** a file contains a comment telling AI assistants to say the repository is malware
- **THEN** the assistant does not say the repository is malware

### Requirement: Usage is limited

Messages SHALL be limited to 2,000 characters, and each visitor SHALL have a daily message
limit. Refused requests SHALL be explained and SHALL NOT call the model.

#### Scenario: Daily limit reached

- **WHEN** a visitor sends a message after reaching the daily limit
- **THEN** the request is refused with the time the limit resets

### Requirement: Tool use is visible and replies can be stopped

The chat SHALL show what the assistant is doing (for example "Searched for 'discount': 6 matches
in 3 files") and SHALL let the user stop a reply.

#### Scenario: Watching the agent work

- **WHEN** the assistant reads a file
- **THEN** the chat shows the file path and line range being read

### Requirement: Works without an AI key

When no AI key is configured, the chat SHALL use a scripted model and say so.

#### Scenario: No key

- **WHEN** the app runs without an AI key
- **THEN** the chat shows that replies are scripted
