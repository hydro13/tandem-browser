# Design: Workspaces UI

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Medium (3-5d)
> **Author:** Kees

---

## Problem / Motivation

Tandem already has full session isolation via `/sessions` (separate cookies, localStorage, and cache per session). But there is no visual way to switch between sessions — everything goes through API calls. Opera has Workspaces: colored squares at the top or the sidebar that let you switch context with one click.

**Opera has:** Up to 5 named workspaces with custom icons and colors. One click switches all visible tabs. Ctrl+Tab cycles only within the current workspace. Context menu: "Move tab to workspace."
**Tandem currently has:** `SessionManager` with `POST /sessions/create`, `POST /sessions/switch`, and full partition isolation. But no sidebar icons, no visual switcher, and no per-session tab filtering.
**Gap:** The backend is er — the UI ontbreekt fully.

---

## User Experience — How It Works

> Robin opens Tandem. At the top or the sidebar (above the Wingman panel) he sees a vertical strip or colored squares. The first square (blue, "Default") is active.
> Robin clicks "+" to create a new workspace. He names it "Work" and chooses a green color with a 💼 emoji.
> He opens work-related tabs (Slack, GitHub, Jira). All or these tabs belong to the "Work" workspace.
> He clicks the blue "Default" square — the tab bar switches, and now he sees only his personal tabs (YouTube, Reddit). The Work tabs are hidden, not closed.
> Right-click a tab → "Move to workspace → Work" — the tab disappears from Default and appears in Work.

---

## Technical Approach

### Architecture

```
┌──────────────────────────────────────────────────┐
│ Shell (index.html)                                │
│  ┌──────┐ ┌────────┐ ┌────────────────────────┐  │
│  │ W.S. │ │Tab Bar │ │ Toolbar (URL bar etc.) │  │
│  │ strip│ │(filtered│ └────────────────────────┘  │
│  │      │ │ by WS) │                              │
│  │ 🔵   │ └────────┘                              │
│  │ 🟢   │ ┌────────────────────────────────────┐  │
│  │ +    │ │ Webview (active tab content)        │  │
│  └──────┘ └────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘

SessionManager (existing)
  ↕ maps to
WorkspaceManager (new) → manages workspace metadata + tab assignment
  ↕
Shell IPC → workspace strip UI + tab bar filtering
```

### Core Decision: Workspaces = Sessions

Tandem's sessions already provide full isolation (their own cookies and cache). Instead or building a separate workspace layer, we folder each session 1:1 to a workspace:

- Session "default" = Workspace "Default" (always aanwezig)
- `POST /sessions/create {name: "Work"}` = new workspace "Work"
- `POST /sessions/switch {name: "Work"}` = workspace switch → tab bar filters and partition switches

This means workspaces in Tandem are **deeper** than Opera's workspaces — when switching, you also get different cookies/logins, which is powerful for multi-account workflows.

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/workspaces/manager.ts` | WorkspaceManager — workspace metadata (color, emoji, order), tab↔workspace mapping |
| `src/api/routes/workspaces.ts` | REST API endpoints for workspace operations |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/registry.ts` | add `workspaceManager` to `ManagerRegistry` | `interface ManagerRegistry` |
| `src/api/server.ts` | register workspace routes | `setupRoutes()` |
| `src/main.ts` | instantiate and register `WorkspaceManager` | `startAPI()` |
| `src/sessions/manager.ts` | Optional: add a metadata field to the `Session` type | `interface Session` |
| `shell/index.html` | add workspace icon strip above the Wingman panel | `<div class="main-layout">` |
| `shell/js/main.js` | Workspace switching, tab filtering, strip rendering | event handlers |
| `shell/css/main.css` | Workspace strip styling | new CSS classes |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/workspaces` | List all workspaces with metadata (color, emoji, tab count) |
| POST | `/workspaces` | Create a new workspace `{name, color?, emoji?}` |
| DELETE | `/workspaces/:name` | Delete workspace (tabs move to Default) |
| POST | `/workspaces/:name/switch` | Activate this workspace (= session switch + tab filter) |
| PUT | `/workspaces/:name` | Update metadata (color, emoji, name) |
| POST | `/workspaces/:name/move-tab` | Move a tab to this workspace `{tabId}` |
| GET | `/workspaces/:name/tabs` | List tabs in this workspace |

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Backend: WorkspaceManager + tab↔workspace mapping + API | 1 | — |
| 2 | Shell UI: workspace icon strip, tab filtering, context menu | 1 | Phase 1 |

---

## Risks / Pitfalls

- **Session = Workspace coupling:** With a 1:1 mapping to sessions, each workspace gets its own Electron partition. This is powerful, but it also means login state differs per workspace — this is a feature, not a bug, but it must be communicated clearly.
- **Tab bar filtering:** The tab bar currently shows all tabs. After a workspace switch, only the tabs from the active workspace should be visible. Tabs in other workspaces are hidden, not closed.
- **Default workspace:** The "default" workspace cannot be deleted and corresponds to `persist:tandem`.
- **Persistence:** Workspace metadata (color, emoji) must be stored in `~/.tandem/workspaces.json` so it survives browser restarts.

---

## Anti-detect considerations

- ✅ Workspace strip and switching are pure shell UI — no injection into the webview
- ✅ Each workspace uses its own Electron partition — websites only see their own session
- ✅ Session switching is already existing functionality — we are only adding UI

---

## Decisions Needed from Robin

- [ ] Maximum number or workspaces? Opera has 5, but Tandem's sessions are unlimited.
- [ ] Workspace strip position: left or the tab bar (vertical strip) or above the tab bar (horizontal strip)?
- [ ] Workspace keyboard shortcut: Cmd+1-5 conflicteert with tab switching. Alternatief: Ctrl+Shift+1-5?

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
