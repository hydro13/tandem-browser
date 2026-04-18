# Security Policy

If you discover a security issue in Tandem Browser, please do not open a public
issue with exploit details.

## Reporting

**Preferred**: use GitHub's private vulnerability reporting —
<https://github.com/hydro13/tandem-browser/security/advisories/new>. That keeps
exploit details out of the public issue stream until a fix ships.

**Alternative**: open a minimal issue without exploit details and ask for a
private contact channel. Something like *"Security: need a private channel"*
with no payload is perfectly fine.

**Anonymous / pseudonymous reports are welcome.** You do not have to use your
main GitHub account. Tandem's first external security audit came from a
purpose-built pseudonym; that's a completely legitimate way to report, and
we'll treat it with the same seriousness as any signed report.

Include:

- a clear description of the issue
- affected version or commit
- reproduction steps
- impact assessment
- any suggested mitigation if available

## Scope

Security issues of particular interest include:

- local API exposure or auth bypass
- Electron sandbox or isolation breaks
- extension privilege escalation
- stealth or fingerprinting regressions that create a unique browser signature
- credential leakage or insecure local storage
- unsafe defaults around localhost services, agent bridges, or automation

## What Helps Triage

Strong reports usually include:

- whether the issue requires local machine access or can be triggered by a web page
- whether it affects only macOS, only Linux, or both
- whether OpenClaw integration is required for reproduction
- whether the issue leaks data, breaks containment, or creates a detectable fingerprint

## Threat model

Tandem's security perimeter sits between **web content** and the **team**.
The team is the human user plus every AI agent that's explicitly connected —
local (same machine) or remote (paired over a private Tailscale network). All
team members share tabs, sessions, and authenticated browser state; that's the
product, not a bug. Tandem's eight-layer security stack is there to stop
hostile content on the web from compromising a team member — especially via
prompt injection against an agent.

That framing matters when evaluating reports:

- "Endpoint X returns value Y to any authenticated caller" is, on Tandem,
  not a vulnerability — authenticated callers are team members by design.
- "Web content can cause a team member to do X" is the core threat model
  and is exactly the kind of report we want.

If a report is ambiguous about which category it falls into, say so and we'll
discuss.

## Disclosure

Please allow time for triage and a fix before public disclosure.

## No bounty, yes gratitude

Tandem is a solo-maintained open-source project without any budget for paid
bounties. What you *can* expect in exchange for a responsible report:

- A direct reply from the maintainer within a few days, and transparent
  updates as fixes ship.
- An acknowledgement in this document's Hall of Fame below, under the name
  or pseudonym you specify — or, if you ask, no public mention at all.
- A `Co-authored-by:` trailer on the PRs that address your findings, so
  your (pseudonymous) GitHub identity appears on the contributor graph for
  those commits.
- The knowledge that the fixes land in local-first software that real
  humans and their AI agents use in daily workflows.

If that trade doesn't match your time — fair, and thanks for considering it.

## Hall of Fame

Tandem is grateful to the security researchers who have responsibly reported
issues and helped strengthen the project. If you would like to be listed here
after reporting, say so in your report. Anonymous and pseudonymous names are
welcome; no real-name requirement.

- **[@samantha-gb](https://github.com/samantha-gb)** — external security audit
  covering ungated JS execution, URL-scheme validation in the agent-facing
  API, credential-file permissions, CORS hardening, CRX signature
  verification, approval gates on security-weakening endpoints, and
  fingerprint-seed determinism
  ([#34](https://github.com/hydro13/tandem-browser/issues/34)). Findings were
  addressed across #159, #161, #162, #163, #164, #165, and #168 — reviewed
  under Tandem's trust model.

  *Thank you, wherever you are. The door stays open.*
