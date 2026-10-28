# github-access Specification

## Purpose
Lets users explore private repositories they own or can read, with the least access possible,
while guaranteeing that nobody can see a repository they don't have access to.

## Requirements

### Requirement: Public repositories need no sign-in

Anyone SHALL be able to load and chat with a public repository without signing in.

#### Scenario: Anonymous public repository

- **WHEN** a signed-out user enters a public repository
- **THEN** the repository loads and the chat is available

### Requirement: Sign-in grants read-only access to chosen repositories

Signing in SHALL use a GitHub App that requests read-only access to repository contents and
metadata, limited to the repositories the user selects when installing it. The app SHALL never
request write access.

#### Scenario: Private repository after sign-in

- **WHEN** a signed-in user who installed the app on their private repository enters it
- **THEN** the repository loads and is marked private

#### Scenario: Private repository not shared with the app

- **WHEN** a signed-in user enters a private repository the app wasn't installed on
- **THEN** the user is told the app can't see it, with a link to grant access

### Requirement: Sign-in is protected against forgery

The sign-in callback SHALL only accept a response that carries the state value issued to the
same browser at the start of sign-in.

#### Scenario: Forged callback

- **WHEN** the callback is called with a state that doesn't match the browser's
- **THEN** sign-in fails and no session is created

### Requirement: Sessions are private to the browser

The GitHub token SHALL be stored only in an encrypted, HTTP-only cookie, and SHALL never be sent
to the page's JavaScript or to the AI model. Signing out SHALL delete it.

#### Scenario: Tampered session cookie

- **WHEN** the session cookie has been modified
- **THEN** it is ignored and the user is treated as signed out

### Requirement: Access is checked on every request

Every page load and chat request for a repository SHALL confirm, with the current user's
credentials, that they can read it, even if the repository is already cached.

#### Scenario: Cached private repository, different user

- **WHEN** user A loaded a private repository and user B, without access, requests it
- **THEN** user B gets the same not-found response as for a repository that doesn't exist
