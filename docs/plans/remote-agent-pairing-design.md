# Design: Remote Agent Pairing for Tandem Browser

> **Date:** 2026-04-15
> **Status:** Draft
> **Effort:** Hard (1-2wk)
> **Author:** Kees, based on Robin's Kanbu pairing model

---

## Problem / Motivation

Tandem Browser already works well when the AI agent runs on the same machine. That is enough for early local workflows, but it breaks down as soon as the browser and the agent live on different nodes.

That matters now because many real users run their agent somewhere else:

- OpenClaw on a Mac mini
- OpenClaw on a Linux box or VPS
- Claude Code on a different workstation
- Codex or another coding agent in a remote environment
- mixed local + remote agents in the same personal tailnet

Today, the cleanest Tandem story is still, more or less, "run the browser and the agent together". That is too narrow for where the product is heading.

The goal of this design is to let **local and remote AI agents connect to Tandem Browser securely**, while keeping the human in control over **which agents may connect** and **whether those connections can be paused, revoked, or removed at any time**.

This design intentionally borrows the **Kanbu pairing model**:

- human-visible one-time setup code
- short TTL
- exchange for durable local credential
- per-machine binding
- explicit revoke
- audit trail

But Tandem is more sensitive than Kanbu. Kanbu exposes project data. Tandem can expose live browser context, authentication state, and real human web sessions. So the Tandem version must be stricter about **network boundary** and clearer about **ownership of trust**.

**Tandem currently has:** strong local API and MCP surfaces, but no first-class pairing model for trusted remote agents.

**Gap:** there is no elegant, user-controlled, secure way to connect a remote agent to a local Tandem Browser instance over a trusted network like Tailscale.

---

## Goals

1. Let Tandem pair with agents that are:
   - local on the same machine
   - remote on another trusted machine
   - MCP-capable or API-only
2. Let a running Tandem instance expose its own **version-matched bootstrap/skill page** so binary installs do not depend on repo access.
3. Keep setup simple for normal users.
4. Avoid raw long-lived secret copy/paste as the primary UX.
5. Preserve Tandem's philosophy of collaboration and trust, not enterprise IAM theater.
6. Allow multiple connected agents over time, and eventually in parallel.
7. Give the human a clear management surface for active bindings.
8. Work cleanly on same-host and Tailscale paths, without any public internet exposure.

---

## Non-Goals

- Public internet relay
- Internet-facing control plane
- OAuth provider work in phase 1
- Fine-grained RBAC explosion
- Scoped browser-enforced trust roles like Observe / Collaborate / Deep Access
- Making Tandem dependent on MCP only
- Replacing the existing local API or MCP model

This is an **access and trust layer**, not a replacement for Tandem's protocol surfaces.

---

## Design Decisions

### 1. Network boundary
Remote agent access is allowed only through:
- the same host
- or a trusted private network path such as Tailscale

LAN access is not a default remote path. If it is ever supported, it should be an explicit advanced opt-in, not the normal product path.

There is **no internet-facing relay** in this design.

Reason:
- a public relay adds attack surface without adding meaningful value to Tandem's core use case
- Tandem sits too close to sensitive browser context to justify relay complexity
- same host + Tailscale is the right default boundary for this product
- LAN is less explicit and less identity-rich than Tailscale, so it should never be the default remote trust boundary

### 2. Binding identity
Bindings are tied to:
- `machineId`
- `machineName`
- `agentLabel`
- `agentType`
- `bindingKind` (`local` or `remote`)

Reason:
A single machine may run multiple distinct agents, for example:
- OpenClaw on minimax
- Claude Code on minimax
- Codex on minimax

These should not collapse into one trust record.

Also, local and remote bindings should be represented as separate connection categories, not because they have different permissions, but because they differ operationally:
- different transport assumptions
- different diagnostics
- different network metadata
- clearer UI for the user

### 3. No scoped trust modes
Tandem should not enforce role slices like Observe, Collaborate, or Deep Access.

Reason:
- Tandem is a trust-based symbiotic browser
- if the agent is not trusted enough for full Tandem capability, it should not be paired
- if it is trusted enough to pair, Tandem should not second-guess the human-agent relationship with browser-level micromanagement
- behavioral limits such as "just observe" belong between the human and their agent, not as browser-enforced product policy

### 4. Binding controls are core, not later polish
Every binding must support from day one:
- pause
- resume
- revoke
- remove

Reason:
The human must always be able to stop, disable, or clean up an existing connection immediately.

### 5. No reduced remote API surface
A paired agent should get the full Tandem capability surface.

Reason:
- pairing is admission into the shared workspace, not permission slicing
- a client either belongs in Tandem or it does not
- there is no product reason to create an artificially reduced remote API just because the client is remote

Implementation detail: some routes may still need technical review to ensure they behave correctly outside localhost assumptions, but that is a robustness concern, not a product-level permission split.

### 6. CLI helper is optional convenience, not phase-1 core
A small helper such as `tandem pair --code TDM-XXXX-XXXX` could be useful for API-only clients, but it is not required for phase 1.

Reason:
- the architecture does not depend on it
- phase 1 can work with direct HTTP exchange plus docs/examples
- a CLI helper is primarily onboarding/UX sugar and can be added after the core pairing model is proven

---

## Core Product Idea

Tandem should expose **two connected layers** for agent connectivity:

1. a **bootstrap/discovery layer**
2. a **pairing/admission layer**

### 1. Bootstrap/discovery layer
A running Tandem instance should host its own local, version-matched agent bootstrap page.

This solves a real product problem:
- today, many agents learn Tandem through `skill/SKILL.md` in the repo
- that works only if the agent can read the repo
- binary installs do not come with repo access
- public hosted docs can drift from the exact installed Tandem version

So Tandem itself should publish the "how to talk to me" surface.

That means a running Tandem instance should expose something like:
- `/agent`
- `/skill`
- `/agent/bootstrap`
- `/agent/manifest`

The exact route name is open, but the idea is fixed: **the running Tandem instance is the source of truth for its own agent instructions and capabilities**.

### 2. Pairing/admission layer
Above that bootstrap surface, Tandem should expose a pairing layer above both MCP and HTTP API access.

That means:

- the agent first discovers the running Tandem instance and reads its local bootstrap page
- the user pairs an agent once
- Tandem issues a durable binding credential
- that binding can authenticate over either:
  - MCP bootstrap flow
  - HTTP API calls
- the user can inspect, pause, revoke, and remove bindings from Tandem UI

So the pairing system becomes the unified trust model for **all agent types**, not just MCP agents.

This is intentionally **not** a scoped-access system. Pairing means admitting an agent into Tandem's shared human-AI browser context. If that trust is not appropriate, the agent should not be paired to Tandem in the first place.

---

## User Experience — How It Works

### Primary story

> Robin installs Tandem Browser and starts it.
>
> Tandem exposes a local agent bootstrap page on its running address, for example on localhost or the machine's Tailscale address.
>
> Robin tells his AI agent to connect to Tandem at that address.
>
> The agent opens Tandem's bootstrap page, reads the exact instructions and capabilities for that running Tandem version, and learns how to connect.
>
> The agent then asks to pair.
>
> Robin opens Tandem's new "Connected Agents" section in Settings and clicks "Pair new agent".
>
> Tandem shows a one-time setup code, valid for 5 minutes, plus a short explanation:
>
> "Give this code to the AI agent you want to connect."
>
> On another machine in the same tailnet, Robin's OpenClaw or Claude Code session says:
>
> "Connect to Tandem with code TDM-7KQ9-4XPM"
>
> The remote agent submits the code to Tandem's pairing endpoint.
>
> Tandem validates it, consumes it, creates a durable binding for that agent and machine, and returns a durable credential.
>
> From that point on, the remote agent can authenticate to Tandem until Robin pauses, revokes, or removes it.
>
> In Tandem's UI, Robin now sees:
>
> - OpenClaw on minimax
> - status: Paired
> - connected 2 minutes ago
> - last used: just now
> - pause / revoke / remove controls

### The intended mental model

The user flow is:
- install Tandem
- start Tandem
- tell your AI agent where Tandem lives
- the agent reads Tandem's own bootstrap page
- open Tandem pairing settings
- generate setup code
- give the code to the agent
- boom, connected

### What the user should feel

- pairing feels like connecting a trusted device, not provisioning infrastructure
- connection is explicit and human-approved
- remote access is possible without opening public ports
- connected agents are visible and controllable
- Tandem helps manage trust, but does not try to police the user's relationship with their own AI agents

---

## Pairing Model

### Tandem states, not roles
For phase 1, the meaningful states are:

- **Paired**
- **Paused**
- **Revoked**
- **Removed**

Where:
- **Paired** means the binding is active and usable
- **Paused** means the binding still exists but cannot authenticate until resumed
- **Revoked** means the credential is invalidated and the binding is permanently disabled unless re-paired or explicitly reissued
- **Removed** means the binding record is removed from the active management list, with audit history retained separately

### Why this better fits Tandem

Tandem is not a sandbox for half-trusted agents.
Tandem is a browser for human-AI symbiosis.

If the trust is not there, the agent should not be paired.
If the trust is there, Tandem should not second-guess the relationship with an internal permission taxonomy.

---

## Agent Types We Must Support

### A. MCP-capable agents
Examples:
- OpenClaw MCP client
- Claude Code with MCP
- Cursor or other MCP-aware tools

These agents can pair and then use Tandem through MCP-backed tools or local wrappers.

### B. API-only agents
Examples:
- remote LLM runtime with plain HTTP client
- custom assistants without MCP support
- lightweight scripts or bridge services inside the same tailnet

These agents should pair through the same setup-code flow, but receive a durable HTTP credential they can use against Tandem's API.

### Design principle

**Pairing is transport-agnostic.**

Do not build one pairing flow for MCP and another for HTTP. Build one pairing system, then let the resulting binding authenticate against either protocol surface.

---

## Technical Approach

### High-level architecture

```text
┌──────────────────────────────┐
│ Tandem Browser               │
│ local machine                │
│                              │
│  Settings > Connected Agents │
│  Pairing service             │
│  Binding registry            │
│  Binding state manager       │
│  API + MCP auth adapters     │
└──────────────┬───────────────┘
               │
               │ same host or trusted Tailscale path
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌───────────────┐   ┌────────────────┐
│ MCP agent     │   │ API-only agent │
│ OpenClaw etc. │   │ script/runtime │
└───────────────┘   └────────────────┘
        │                     │
        │ submit setup code   │ submit setup code
        └──────────┬──────────┘
                   ▼
        /pairing/exchange or equivalent
                   │
                   ▼
      durable binding credential issued
                   │
                   ├─ used via MCP auth adapter
                   └─ used via HTTP Authorization header
```

---

## Connectivity Flow

### Step 1: Tandem starts and exposes bootstrap surface
A running Tandem instance exposes a local bootstrap page and optionally a machine-readable manifest.

This surface should tell an agent:
- Tandem version
- available transport surfaces
- base URL
- pairing instructions
- supported auth method
- available capability families
- versioned examples for this exact Tandem build

### Step 2: agent discovers Tandem
The human tells the agent where Tandem lives, for example:
- `http://localhost:8765`
- `http://100.x.y.z:8765` on Tailscale

The agent opens Tandem's bootstrap page and learns how this specific running instance works.

### Step 3: user generates setup code
Tandem creates a one-time code.

Properties:
- format: `TDM-XXXX-XXXX`
- short TTL, likely 5 minutes
- one-time use only
- only one active unused code per local Tandem profile by default
- rate-limited generation

### Step 4: user gives code to agent
Examples:
- "Connect to Tandem with code TDM-7KQ9-4XPM"
- paste it into an agent settings screen
- use a CLI pairing command

### Step 5: agent exchanges code
Remote agent sends:
- setup code
- machine ID
- machine name
- agent label
- agent type (`openclaw`, `claude-code`, `codex`, `custom-api`, etc.)
- client capabilities (`mcp`, `http`, or both)

### Step 6: Tandem validates and consumes code
Checks:
- code exists
- not expired
- not consumed
- local pairing mode enabled
- request source allowed by local network policy

### Step 7: Tandem creates binding
Creates a persistent binding tied to:
- local Tandem profile
- machine identity
- machine name
- agent label
- agent type
- capability profile
- issue time
- last used time
- binding state

### Step 8: Tandem returns durable credential
The credential should be:
- long random secret
- only shown to the remote client once
- hashed in local storage on Tandem side
- revocable
- pausable by binding state
- ideally prefixed, for example `tdm_ast_...`

### Step 9: remote agent stores credential locally
Examples:
- MCP config file
- local agent keychain
- environment secret store
- OpenClaw node config

---

## Credential Model

### Setup code
Human-facing bootstrap secret.

Recommended properties:
- prefix: `TDM`
- 8 safe characters split in two groups
- TTL: 5 minutes
- one-time only
- visible in Tandem UI only

### Durable binding token
Machine/agent credential.

Recommended properties:
- 256-bit random token minimum
- stored hashed on Tandem side, SHA-256 + Argon2 or similar
- opaque bearer token for phase 1
- revocable
- separate token per binding
- token rotation supported later

### Why bearer token first?
Because it works for both:
- API-only clients immediately
- MCP clients through existing transport wrappers

Mutual TLS or signed client assertions may come later, but bearer + same-host/Tailscale + pairing is the fastest elegant first version.

---

## Transport Model

### Allowed network paths
Phase 1 should support only:
- same-host access
- Tailscale private-network access

LAN can exist only as a later advanced opt-in if there is a real need, but it should not be part of the default phase-1 remote story.

### Explicit non-goal
No:
- public relay
- internet-facing webhook bridge
- cloud control plane
- public auth gateway

This matters because pairing should not accidentally become "public API but with nicer tokens".

---

## API Design

These names are illustrative, not final.

### Bootstrap endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/agent` | Human-readable bootstrap page for agents |
| GET | `/skill` | Version-matched skill/instructions page served by the running instance |
| GET | `/agent/manifest` | Machine-readable manifest for API or agent clients |
| GET | `/agent/version` | Minimal version/capability summary |

### Pairing endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/pairing/setup-code` | Generate one-time setup code from Tandem UI |
| GET | `/pairing/setup-code/active` | Get current active setup code + TTL |
| POST | `/pairing/exchange` | Exchange setup code for durable binding token |
| GET | `/pairing/bindings` | List connected agents |
| POST | `/pairing/bindings/:id/pause` | Pause a binding |
| POST | `/pairing/bindings/:id/resume` | Resume a paused binding |
| POST | `/pairing/bindings/:id/revoke` | Revoke a binding |
| DELETE | `/pairing/bindings/:id` | Remove a binding from active management |
| GET | `/pairing/whoami` | Validate binding token and return binding info |

### Shared auth behavior
Once paired, both MCP and HTTP clients authenticate using the binding token.

Examples:
- HTTP: `Authorization: Bearer tdm_ast_...`
- MCP: wrapper passes same token into Tandem auth adapter

### Capability negotiation
During pairing, the client may declare:

```json
{
  "agentType": "openclaw",
  "agentLabel": "OpenClaw on minimax",
  "transport": ["http", "mcp"],
  "capabilities": {
    "interactive": true,
    "supportsMcp": true,
    "supportsHttp": true
  }
}
```

Tandem uses this for display and compatibility, not as a scoped permission model.

---

## Internal Binding Model

Internally, Tandem should manage **binding state**, not scoped role slices.

Example internal representation:

```ts
type BindingState = 'paired' | 'paused' | 'revoked';

interface AgentBindingRecord {
  profileId: string;
  machineId: string;
  machineName?: string;
  agentLabel: string;
  agentType: string;
  transportModes: Array<'http' | 'mcp'>;
  tokenHash: string;
  tokenPrefix: string;
  state: BindingState;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  pausedAt?: string;
}
```

The backend still decides whether a binding may authenticate at all.
But once authenticated, the binding is admitted to the full Tandem capability surface.

---

## UI Design in Tandem

### New Settings section
**Connected Agents**

Shows:
- remote access availability
- current network policy
- active setup code, if any
- list of connected agents

### Per binding card
- agent label
- machine name
- agent type
- status
- connected since
- last used
- network origin when known
- pause button
- revoke button
- remove button

### Pair new agent dialog
- explanation in plain language
- setup code
- countdown
- short examples:
  - "Connect to Tandem with code TDM-XXXX-XXXX"
  - CLI example for API-only clients

### Design principle
The UI should feel like:
- pairing and managing trusted copilot connections
not like:
- configuring an enterprise identity provider

---

## Binding Controls

Every existing connection should support these controls from day one:

### Pause
- temporarily disable a binding without deleting it
- useful when a machine is offline, being serviced, or should stop interacting for a while

### Resume
- re-enable a paused binding

### Revoke
- invalidate the credential immediately
- the remote agent must re-pair or receive a fresh credential to connect again

### Remove
- remove the binding from the active management list after it is already paused or revoked
- audit history should still remain available

This is not optional future polish. It is core to the design.

---

## Local vs Remote Agents

### Local agents
Local agents can also use the pairing model if desired.
That gives one consistent trust system.

But phase 1 can keep localhost-dev workflows working as they do today.

### Remote agents
Remote agents benefit most:
- same tailnet, different machine
- no repo co-location required
- no local shell on Tandem host required
- human-controlled access without public exposure

---

## MCP and API-only coexistence

This is critical.

### MCP-capable agent path
- pair once
- receive binding token
- MCP server or wrapper uses binding token to call Tandem
- no second-class pairing path

### API-only agent path
- pair once
- receive binding token
- direct HTTP calls to Tandem API
- same trust admission model

### Why this is the right shape
Because otherwise Tandem would accidentally split into:
- a "real" integration path for MCP tools
- a second-class path for everyone else

That would be a mistake.

Tandem should be **agent-native, not MCP-exclusive**.

---

## Audit and Visibility

Every paired agent action should be attributable.

Per binding, log:
- binding created
- setup code exchanged
- binding paused
- binding resumed
- token revoked
- binding removed
- failed auth attempts
- last successful use
- network source if available

This supports both security and product clarity.

Tandem is about shared context, so the human must be able to answer:
- who is connected?
- what state is that connection in?
- when were they last active?
- can I stop them right now?

---

## Data Model Proposal

### `agent_setup_codes`
Fields:
- `id`
- `code`
- `profile_id`
- `created_at`
- `expires_at`
- `consumed_at`
- `cancelled_at`
- `created_by_user`

### `agent_bindings`
Fields:
- `id`
- `profile_id`
- `machine_id`
- `machine_name`
- `agent_label`
- `agent_type`
- `transport_modes` (json)
- `token_hash`
- `token_prefix`
- `state`
- `created_at`
- `last_used_at`
- `paused_at`
- `revoked_at`
- `notes` optional

### `agent_binding_events`
Fields:
- `id`
- `binding_id`
- `event_type`
- `metadata`
- `created_at`
- `source_ip` optional
- `tailnet_identity` optional

---

## Security Considerations

### Strong points of this design
- no public long-lived bootstrap secret sharing
- one-time human-visible setup code
- durable credential never needs to be shown in UI again
- pause, revoke, and remove are built in
- easy mental model for users
- transport-agnostic
- compatible with local-first and tailnet-first deployment

### Key risks

#### 1. Over-trusting remote agents
Mitigation:
- pairing is explicit
- bindings are visible
- pause, revoke, and remove are first-class controls
- Local + Tailscale only network boundary

#### 2. Public exposure by accident
Mitigation:
- same-host and Tailscale only in phase 1
- no public relay path
- no internet-facing control plane

#### 3. Token theft on remote host
Mitigation:
- per-binding pause/revoke
- last-used visibility
- future token rotation
- encourage local secret storage on agent host

#### 4. Sensitive route leakage
Mitigation:
- only paired bindings may authenticate
- sensitive routes are still guarded by Tandem's normal internal safety architecture
- do not add internet-facing relay paths

#### 5. Setup code brute force
Mitigation:
- short TTL
- consume-on-use
- rate limit generation and exchange
- use safe characters and enough entropy

---

## Why this fits Tandem philosophically

This design supports Tandem's actual idea:
- human and AI share context
- human keeps authorship and agency
- trust is explicit
- collaboration is first-class

It does **not** force a master-servant model.
It does **not** turn Tandem into a corporate access-control console.

The browser is not deciding how much a trusted agent may participate.
The browser is deciding whether that agent is admitted into the shared workspace at all.

That is a much better fit for Tandem.

---

## Recommended Phasing

### Phase 1: Core pairing
Ship the Kanbu-shaped backbone.

Scope:
- setup code generation
- exchange for durable token
- binding storage
- pause, resume, revoke, remove
- HTTP auth using binding token
- same-host/Tailscale reachability only
- Connected Agents UI
- binding state model in backend and UI

### Phase 2: MCP adapter integration
Scope:
- first-class pairing flow for MCP-capable agents
- local wrapper or MCP auth bridge
- `whoami` and capability discovery
- nicer agent-specific onboarding copy

### Phase 3: Hardening and polish
Scope:
- token rotation
- event log UI
- richer device identity display
- parallel multi-agent tuning

### Phase 4: Optional federation, only if needed
Scope:
- signed clients or stronger client identity
- richer remote fleet management inside private-network constraints

This should be delayed until the simple pairing model proves itself.

---

## Resolved Decisions

- **Local and remote bindings are separate categories** in the model and UI, but not separate trust levels.
- **Remote pairing should default to Tailscale only**. LAN is not part of the default phase-1 remote path and should only be considered later as an advanced opt-in.
- **A CLI helper for API-only clients is optional** and not required for phase 1.
- **There is no intentionally reduced remote API surface**. A paired client is admitted to the full Tandem capability surface.

---

## Recommendation

Build this.

More specifically:

- adopt the **Kanbu one-time pairing pattern**
- make it **transport-agnostic**
- keep the user-facing model to **paired / paused / revoked / removed**, not scopes or roles
- default to **same host + Tailscale only**, never public relay
- treat **local** and **remote** bindings as separate connection categories
- bind identities to **machine + agent label**
- treat MCP and API-only agents as equal citizens
- do not artificially reduce the remote API surface
- ship the simplest version that lets a remote OpenClaw node or API-only agent pair with a local Tandem Browser safely

This is the right bridge between:
- Tandem as a local-first human-AI browser
- and Tandem as a real multi-agent browser substrate

It is elegant, understandable, and aligned with the product.
