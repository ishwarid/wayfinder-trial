# todo-board Specification

## Purpose
Gives an instant, AI-free list of the work-in-progress markers left in a codebase, so users can
see unfinished and risky areas at a glance.

## Requirements

### Requirement: Work-in-progress comments are listed

The workspace SHALL list every comment containing TODO, FIXME, HACK, XXX or BUG, with its tag,
text, file and line, grouped by tag, without calling a model.

#### Scenario: Repository with TODOs

- **WHEN** a file has `// FIXME: rounding is wrong for 3-for-2 deals` on line 42
- **THEN** the board lists it under FIXME with its text and `path:42`

### Requirement: Only comments count

Markers SHALL only be counted inside comments, not in strings or identifiers.

#### Scenario: Marker in a string

- **WHEN** a line is `const label = "TODO list";`
- **THEN** it does not appear on the board

### Requirement: Each item links to its line

Each item SHALL link to its line on GitHub at the loaded commit.

#### Scenario: Opening an item

- **WHEN** the user selects a TODO item
- **THEN** GitHub opens at that file and line for the loaded commit
