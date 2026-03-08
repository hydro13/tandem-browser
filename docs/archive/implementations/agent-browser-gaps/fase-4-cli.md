# Phase 4 — tandem CLI: Command Line Wrapper

> **Goal:** Thin CLI wrapper rond the Tandem REST API.
> Zelfde developer UX if agent-browser, but then to jouw own Tandem.
> **Sessions:** 1
> **Requires:** Phase 1-3 compleet (snapshot + sessions)

---

## Existing code to read (required)

Read this files (usage Read tool, NIET cat):

1. **`README.md`** — Alle existing API endpoints + beschrijvingen
2. **`package.json`** — Name, versie, dependencies or the hoofdproject
3. **`tsconfig.json`** — TypeScript config or the hoofdproject
   - **LET OP:** `rootDir: ./src` → CLI zit BUITEN src/
   - CLI has a **own** tsconfig.json nodig
   - Root tsconfig must `cli/` **excluden** to conflicten te voorkomen

---

## Architectuur

```
tandem snapshot --interactive
      │
      ▼
cli/index.ts (commander.js)
      │
      ▼
cli/commands/snapshot.ts
      │
      ▼
cli/client.ts
  fetch("http://localhost:8765/snapshot?interactive=true", {
    headers: { Authorization: `Bearer ${token}` }
  })
      │
      ▼
stdout: the accessibility tree text
```

### Token ophalen

API token staat in `~/.tandem/api-token` — same file if the server uses.

---

## Bestandsstructuur

```
cli/
├── package.json          ← apart package: @hydro13/tandem-cli
├── tsconfig.json         ← OWN tsconfig, output to cli/dist/
├── index.ts              ← entry point, commander setup + #!/usr/bin/env node
├── client.ts             ← HTTP client, token laden
└── commands/
    ├── open.ts           ← tandem open <url>
    ├── snapshot.ts       ← tandem snapshot [opties]
    ├── click.ts          ← tandem click <sel>
    ├── fill.ts           ← tandem fill <sel> <text>
    ├── eval.ts           ← tandem eval <js>
    ├── screenshot.ts     ← tandem screenshot [path]
    ├── cookies.ts        ← tandem cookies [set]
    └── session.ts        ← tandem session <subcommand>
```

---

## tsconfig conflict oplossen

The root `tsconfig.json` has `rootDir: ./src`. The CLI zit in `cli/` (buiten src/).
You must the root tsconfig aanpassen to `cli/` te excluden:

```json
// In root tsconfig.json, voeg toe about "exclude":
"exclude": ["cli", "node_modules", "dist"]
```

And maak a aparte `cli/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["./**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

---

## Commands

```bash
# Navigatie
tandem open <url>
tandem open https://x.com

# Snapshot
tandem snapshot
tandem snapshot --interactive          # -i
tandem snapshot --compact              # -c
tandem snapshot --selector "#main"     # -s "#main"
tandem snapshot --depth 3              # -d 3
tandem snapshot -i -c -d 5             # combinaties

# Interactie
tandem click "#submit"
tandem click @e4                       # via @ref out snapshot
tandem fill "#email" "test@x.com"
tandem fill @e5 "test@x.com"
tandem eval "document.title"
tandem eval "window.location.href"

# Media
tandem screenshot                      # print pad to stdout
tandem screenshot ./page.png           # save op pad

# Cookies
tandem cookies                         # alle cookies (JSON)
tandem cookies set session_id abc123

# Sessions (phase 3)
tandem session list
tandem session create agent1
tandem session switch agent1
tandem session destroy agent1

# Meta
tandem --version
tandem --help
tandem snapshot --help

# --session flag (X-Session header)
tandem --session agent1 open https://example.com
tandem --session agent1 snapshot -i
tandem --session agent1 cookies
```

---

## cli/client.ts

```typescript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const API_BASE = process.env.TANDEM_API || 'http://localhost:8765';
const TOKEN_PATH = path.join(os.homedir(), '.tandem', 'api-token');

function getToken(): string {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
  } catch {
    return '';
  }
}

export async function api(
  method: string,
  endpoint: string,
  body?: unknown,
  session?: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
  if (session) headers['X-Session'] = session;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error(`Error: ${(err as { error: string }).error}`);
    process.exit(1);
  }

  return res.json();
}
```

---

## cli/package.json

```json
{
  "name": "@hydro13/tandem-cli",
  "version": "0.1.0",
  "description": "CLI for Tandem Browser API",
  "bin": {
    "tandem": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## Implementatie stappen

1. Maak `cli/package.json` + `cli/tsconfig.json`
2. **Root tsconfig aanpassen:** voeg `"cli"` toe about exclude array
3. `cd cli && npm install`
4. Maak `cli/client.ts` — token laden + fetch wrapper
5. Maak `cli/index.ts` — commander setup + globale `--session` optie
   - **BELANGRIJK:** First regel must `#!/usr/bin/env node` are
6. Per command (begin with the meest gebruikte):
   - `open.ts` → `POST /navigate`
   - `snapshot.ts` → `GET /snapshot` with query params
   - `click.ts` → `POST /snapshot/click` (if @ref) or `POST /click`
   - `fill.ts` → `POST /snapshot/fill` (if @ref) or `POST /type`
   - `eval.ts` → `POST /devtools/evaluate`
   - `screenshot.ts` → `GET /screenshot` → base64 → `fs.writeFileSync(path, Buffer.from(base64, 'base64'))`
   - `cookies.ts` → `GET /cookies` or `POST /devtools/cdp` Network.setCookie
   - `session.ts` → `/sessions/*` endpoints
7. `cd cli && npx tsc` — zero errors
8. Verifieer that root `npx tsc` also still works (no conflict with cli/)
9. `cd cli && npm link` for globale `tandem` command
10. Test alle commands (zie verificatie hieronder)
11. Commit

---

## Verificatie commando's

```bash
cd cli && npm run build && npm link

# Basis
tandem --version
tandem --help

# Navigatie
tandem open https://example.com

# Snapshot
tandem snapshot
tandem snapshot -i
tandem snapshot -i -c
tandem snapshot --selector "main"

# Klik via @ref (usage a @ref out snapshot output)
tandem snapshot -i   # kijk welke @refs er are
tandem click @e1

# Fill
tandem fill @e5 "test@example.com"

# Eval
tandem eval "document.title"

# Screenshot
tandem screenshot /tmp/page.png && open /tmp/page.png

# Sessions
tandem session list
tandem session create test
tandem --session test open https://example.com
tandem --session test snapshot -i
tandem session destroy test

# Cookies
tandem cookies
```

---

## Veelgemaakte fouten

**Node.js:**

- ❌ `fetch` is not beschikbaar in Node.js < 18
- ✅ Electron 40 bundelt Node.js 20+. If the CLI also standalone draait, check Node versie

**Binary permissions:**

- ❌ `npm link` geeft EACCES op the binary
- ✅ First regel or `index.ts`: `#!/usr/bin/env node` + na build: `chmod +x dist/index.js`

**Screenshot:**

- ❌ Screenshot base64 data direct if string save
- ✅ `fs.writeFileSync(path, Buffer.from(base64, 'base64'))`

**tsconfig:**

- ❌ CLI files compileren with the root tsconfig (rootDir conflict)
- ✅ Aparte `cli/tsconfig.json` + root tsconfig excludet `cli/`

**@ref detection:**

- ❌ `@e4` if CSS selector sturen to `/click`
- ✅ Detecteer @-prefix: if argument begint with `@`, usage `/snapshot/click` endpoint; anders `/click`
