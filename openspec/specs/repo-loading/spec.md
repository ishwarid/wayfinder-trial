# repo-loading Specification

## Purpose
Turns a GitHub repository reference into a snapshot of its readable files that the rest of the
app can explore safely: filtered to source code, with secrets removed, and cached.

## Requirements

### Requirement: Repository references are parsed flexibly

The system SHALL accept a repository as `owner/repo`, a `github.com` URL, or a URL to a branch
or file within it, and SHALL reject anything else with a message showing the accepted formats.

#### Scenario: Pasting a file URL

- **WHEN** the user enters `https://github.com/acme/shop/blob/main/src/app.ts`
- **THEN** the repository `acme/shop` at ref `main` is loaded

#### Scenario: Invalid input

- **WHEN** the user enters `not a repo`
- **THEN** the system shows that it expects `owner/repo` or a GitHub URL

### Requirement: Snapshots are pinned to a commit

A loaded repository SHALL be pinned to the commit its ref pointed to at load time, and that
commit SHALL be shown to the user. Every citation link SHALL point at that commit.

#### Scenario: Branch moves after loading

- **WHEN** new commits land on the branch after the repository was loaded
- **THEN** answers and links still refer to the originally loaded commit

### Requirement: Only readable source is kept

The snapshot SHALL leave out dependency and build folders, version control data, lockfiles,
binary files and files over 512 KB, and SHALL report how many files were skipped.

#### Scenario: Repository with dependencies and images

- **WHEN** a repository containing `node_modules/`, a lockfile and PNG images is loaded
- **THEN** none of those appear in the snapshot
- **AND** the workspace shows the number of skipped files

### Requirement: Secrets are removed before storage

Environment files and private key files SHALL be left out entirely. Text that looks like a
credential SHALL be replaced with a redaction marker before the snapshot is stored, so it never
reaches the cache, the model or the user. Line numbers SHALL be unchanged by redaction.

#### Scenario: Hard-coded API key

- **WHEN** a source file contains `API_KEY = "abcd1234efgh5678"`
- **THEN** the snapshot contains `API_KEY = "[redacted]"` on the same line

#### Scenario: Environment file

- **WHEN** the repository contains a `.env` file
- **THEN** the file is not in the snapshot

### Requirement: Oversized repositories are refused clearly

Repositories beyond the size limits SHALL be refused with a message that says which limit was
exceeded, rather than failing partway.

#### Scenario: Very large repository

- **WHEN** a repository has more readable files than the limit
- **THEN** the user is told the repository is too large and what the limit is
