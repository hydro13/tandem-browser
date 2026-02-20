# Fase 4 — tandem CLI: Command Line Wrapper

> **Doel:** Thin CLI wrapper rond de Tandem REST API.
> Zelfde developer UX als agent-browser, maar dan naar jouw eigen Tandem.
> **Sessies:** 1
> **Vereist:** Fase 1-3 compleet (snapshot + sessions)

---

## Bestaande code te lezen (verplicht)

Lees deze bestanden (gebruik Read tool, NIET cat):

1. **`README.md`** — Alle bestaande API endpoints + beschrijvingen
2. **`package.json`** — Naam, versie, dependencies van het hoofdproject
3. **`tsconfig.json`** — TypeScript config van het hoofdproject
   - **LET OP:** `rootDir: ./src` → CLI zit BUITEN src/
   - CLI heeft een **eigen** tsconfig.json nodig
   - Root tsconfig moet `cli/` **excluden** om conflicten te voorkomen

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
stdout: de accessibility tree tekst
```

### Token ophalen

API token staat in `~/.tandem/api-token` — zelfde bestand als de server gebruikt.

---

## Bestandsstructuur

```
cli/
├── package.json          ← apart package: @hydro13/tandem-cli
├── tsconfig.json         ← EIGEN tsconfig, output naar cli/dist/
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

De root `tsconfig.json` heeft `rootDir: ./src`. De CLI zit in `cli/` (buiten src/).
Je moet de root tsconfig aanpassen om `cli/` te excluden:

```json
// In root tsconfig.json, voeg toe aan "exclude":
"exclude": ["cli", "node_modules", "dist"]
```

En maak een aparte `cli/tsconfig.json`:

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
tandem click @e4                       # via @ref uit snapshot
tandem fill "#email" "test@x.com"
tandem fill @e5 "test@x.com"
tandem eval "document.title"
tandem eval "window.location.href"

# Media
tandem screenshot                      # print pad naar stdout
tandem screenshot ./page.png           # opslaan op pad

# Cookies
tandem cookies                         # alle cookies (JSON)
tandem cookies set session_id abc123

# Sessies (fase 3)
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
2. **Root tsconfig aanpassen:** voeg `"cli"` toe aan exclude array
3. `cd cli && npm install`
4. Maak `cli/client.ts` — token laden + fetch wrapper
5. Maak `cli/index.ts` — commander setup + globale `--session` optie
   - **BELANGRIJK:** Eerste regel moet `#!/usr/bin/env node` zijn
6. Per command (begin met de meest gebruikte):
   - `open.ts` → `POST /navigate`
   - `snapshot.ts` → `GET /snapshot` met query params
   - `click.ts` → `POST /snapshot/click` (als @ref) of `POST /click`
   - `fill.ts` → `POST /snapshot/fill` (als @ref) of `POST /type`
   - `eval.ts` → `POST /devtools/evaluate`
   - `screenshot.ts` → `GET /screenshot` → base64 → `fs.writeFileSync(path, Buffer.from(base64, 'base64'))`
   - `cookies.ts` → `GET /cookies` of `POST /devtools/cdp` Network.setCookie
   - `session.ts` → `/sessions/*` endpoints
7. `cd cli && npx tsc` — zero errors
8. Verifieer dat root `npx tsc` ook nog werkt (geen conflict met cli/)
9. `cd cli && npm link` voor globale `tandem` command
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

# Klik via @ref (gebruik een @ref uit snapshot output)
tandem snapshot -i   # kijk welke @refs er zijn
tandem click @e1

# Fill
tandem fill @e5 "test@example.com"

# Eval
tandem eval "document.title"

# Screenshot
tandem screenshot /tmp/page.png && open /tmp/page.png

# Sessies
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

- ❌ `fetch` is niet beschikbaar in Node.js < 18
- ✅ Electron 40 bundelt Node.js 20+. Als de CLI ook standalone draait, check Node versie

**Binary permissions:**

- ❌ `npm link` geeft EACCES op de binary
- ✅ Eerste regel van `index.ts`: `#!/usr/bin/env node` + na build: `chmod +x dist/index.js`

**Screenshot:**

- ❌ Screenshot base64 data direct als string opslaan
- ✅ `fs.writeFileSync(path, Buffer.from(base64, 'base64'))`

**tsconfig:**

- ❌ CLI bestanden compileren met de root tsconfig (rootDir conflict)
- ✅ Aparte `cli/tsconfig.json` + root tsconfig excludet `cli/`

**@ref detectie:**

- ❌ `@e4` als CSS selector sturen naar `/click`
- ✅ Detecteer @-prefix: als argument begint met `@`, gebruik `/snapshot/click` endpoint; anders `/click`
