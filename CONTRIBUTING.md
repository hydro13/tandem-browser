# Contributing

Thanks for contributing to Tandem Browser.

## Before You Start

- Read [README.md](README.md) for the product overview
- Read [PROJECT.md](PROJECT.md) for architecture context
- Keep changes local-first and privacy-preserving
- Avoid introducing new dependencies unless they are clearly justified

## Development Workflow

```bash
npm install
npm run verify
```

For manual app testing:

```bash
npm start
```

## Coding Expectations

- TypeScript should compile cleanly
- Prefer focused patches over broad rewrites
- Keep Electron security defaults intact unless there is a reviewed reason to change them
- Do not introduce cloud dependencies into core browsing flows
- Keep public-facing text in English

## Commits

Use conventional commit prefixes:

- `fix:`
- `feat:`
- `chore:`
- `docs:`
- `refactor:`
- `test:`

## Pull Requests

A good pull request should include:

- a clear problem statement
- the implementation approach
- test or verification notes
- screenshots when UI changes are visible

## Security-Sensitive Changes

If a change touches stealth behavior, session isolation, extension loading, or
the local API security model, call that out explicitly in the PR description.
