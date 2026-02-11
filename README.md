# 🧠🤝👤 Tandem Browser

> Half mens, half AI. Samen het internet op.

A browser built for **human-AI symbiosis**. Robin (human) and Kees (AI) browse the web as one entity. Robin handles detection gates, captchas, and human judgment calls. Kees navigates, extracts data, and automates workflows.

## Why?

Platforms are locking out AI crawlers. LinkedIn returns 403. Twitter blocks bots. Even basic websites hide behind Cloudflare. 

A real browser with a real human behind it passes every detection gate. Tandem combines that with AI-powered automation — the best of both worlds.

## Quick Start

```bash
cd tandem-browser
npm install
npm run dev
```

The browser opens. The API starts on `localhost:8765`.

## API

Kees (via OpenClaw) controls the browser through a local HTTP API:

```bash
# Where are we?
curl localhost:8765/status

# Navigate
curl -X POST localhost:8765/navigate -H 'Content-Type: application/json' -d '{"url":"https://linkedin.com"}'

# Read the page
curl localhost:8765/page-content

# Click something
curl -X POST localhost:8765/click -H 'Content-Type: application/json' -d '{"selector":"button.sign-in"}'

# Type text
curl -X POST localhost:8765/type -H 'Content-Type: application/json' -d '{"selector":"#email","text":"robin@example.com"}'

# Screenshot
curl localhost:8765/screenshot --output screen.png

# Ask Robin for help (shows notification)
curl -X POST localhost:8765/copilot-alert -H 'Content-Type: application/json' -d '{"title":"Captcha!","body":"Er staat een captcha op LinkedIn, kun je die even oplossen?"}'
```

## Architecture

```
Tandem Browser (Electron)
├── Browser UI (Chromium) ← Robin sees and navigates
├── Tandem API (localhost:8765) ← Kees sends commands
├── Stealth Layer ← Anti-detection
└── Copilot Alerts ← Kees asks Robin for help
```

## Philosophy

- **Real browser** — Not headless, not Puppeteer. A browser Robin actually uses.
- **API-first** — Everything Kees does goes through the HTTP API.
- **Local only** — No cloud, no external services. Your data stays yours.
- **Tandem** — Together stronger than apart.

## Origin

Rebuilt from `totalrecall-browserV2` — Robin's custom browser with VSCode extension support and Claude CLI integration. Same DNA, new focus: AI-human collaborative browsing.

## License

MIT
