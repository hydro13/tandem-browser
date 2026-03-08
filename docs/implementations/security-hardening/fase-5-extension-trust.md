# Phase 5 — Extension Trust: Treat Extensions As Privileged Actors

> **Feature:** Security hardening
> **Sessions:** 1 session
> **Priority:** MEDIUM-HIGH
> **Depends on:** Phase 4 complete

---

## Goal Or This Phase

Introduce an explicit extension trust model so installed extensions, native
messaging bridges, and extension-origin API calls are scoped like privileged
software rather than implicitly trusted local helpers.

---

## Existing Code To Read — Only This

| File | Look for | Why |
|------|----------|-----|
| `src/api/server.ts` | auth/CORS behavior | extension-origin access path |
| `src/api/routes/extensions.ts` | extension routes | current extension API surface |
| `src/extensions/loader.ts` | installed extension model | identity and load path |
| `src/extensions/manager.ts` | runtime extension handling | central extension behavior |
| `src/extensions/native-messaging.ts` | host integration | native messaging trust |
| `src/extensions/nm-proxy.ts` | proxy behavior | privileged extension bridge |
| `AGENTS.md` | full file | workflow and anti-detect rules |

---

## Build In This Phase

### 1. Define Extension Trust Levels

Expected examples:

- trusted extension
- limited extension
- unknown extension

### 2. Scope Sensitive Routes

Do not allow every extension-origin request to reach every Tandem capability.

### 3. Improve Auditing

Add enough logging to answer:

- which extension called what
- whether it was allowed
- why it was allowed or denied

---

## Acceptance Criteria

- [ ] Sensitive routes are not universally available to all extensions
- [ ] Trusted extensions still work where intended
- [ ] Extension-origin access is visible in audit logs
- [ ] Native messaging trust boundaries are clearer and more explicit

---

## Known Pitfalls

- Breaking critical extension workflows like 1Password
- Tying policy only to origin string without stable extension identity
- Creating an allowlist model with no operational UI or documentation
