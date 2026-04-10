# Security Agent Fleet — Cron Specifications

> OpenClaw agent definitions for autonomous security monitoring.
> These agents use REST endpoints (not WebSocket) and complement the Gatekeeper.

## Sentinel Agent (every 5 minutes)

Patrols security status, processes pending gatekeeper decisions, and checks for high-severity events.

```json
{
  "name": "Tandem Sentinel",
  "schedule": {"kind": "every", "everyMs": 300000},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Security patrol: GET http://127.0.0.1:8765/security/status and /security/gatekeeper/queue. If there are pending decisions, analyze and submit via POST /security/gatekeeper/decide. Check /security/events?severity=high for recent high-severity events. If critical issues found, alert immediately.",
    "model": "sonnet"
  },
  "delivery": {"mode": "announce"}
}
```

## Scanner Agent (every 2 hours)

Deep security scan — checks open tabs against baselines, reports anomalies and zero-day candidates.

```json
{
  "name": "Tandem Scanner",
  "schedule": {"kind": "every", "everyMs": 7200000},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Deep security scan: GET http://127.0.0.1:8765/tabs/list for open tabs. For each tab, GET /security/page/analysis. Check for anomalies vs baselines via GET /security/baselines/:domain. Report any zero-day candidates or suspicious changes.",
    "model": "sonnet"
  },
  "delivery": {"mode": "announce"}
}
```

## Updater Agent (daily at 06:00 Europe/Brussels)

Daily maintenance — updates blocklists, generates report, reviews zero-days, prunes old events.

```json
{
  "name": "Tandem Security Updater",
  "schedule": {"kind": "cron", "expr": "0 6 * * *", "tz": "Europe/Brussels"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Daily security maintenance: 1) Update blocklists via POST /security/blocklist/update. 2) GET /security/report?period=day for yesterday's report. 3) Review zero-day candidates via GET /security/zero-days. 4) Prune events older than 90 days via POST /security/maintenance/prune. Report summary.",
    "model": "sonnet"
  },
  "delivery": {"mode": "announce"}
}
```

## Incident Agent (on-demand)

Not a cron job — spawned by Sentinel or Gatekeeper when a critical event occurs.
Uses Opus model for deep analysis and forensic investigation.

### Trigger conditions:
- Zero-day candidate detected on high-trust domain (trust ≥ 70)
- 3+ high-severity events within 5 minutes
- Gatekeeper escalation message received
- Blocklist hit on a previously trusted domain

### Available endpoints for investigation:
- `GET /security/baselines/:domain` — check baseline deviation
- `GET /security/page/analysis` — full page security analysis
- `GET /security/page/scripts` — script inventory + fingerprints
- `GET /security/anomalies` — recent anomaly events
- `GET /security/zero-days` — open zero-day candidates
- `GET /security/report?period=day` — daily summary
- `GET /security/trust/changes` — trust score history
- `GET /security/events?severity=critical` — critical events
