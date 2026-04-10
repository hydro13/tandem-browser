# Tandem Security Shield — Current Overview

Tandem's security model is layered around one constraint: page content can be
hostile, and an agent with browser access changes the threat model.

## Current Layers

| Layer | Name | Purpose |
|-------|------|---------|
| 1 | Network Shield | Blocks known malicious domains and infrastructure before navigation completes |
| 2 | Outbound Guard | Scans outbound requests for credential leaks and suspicious exfiltration |
| 3 | Content Analyzer | Analyzes loaded pages for risky forms, trackers, and threat patterns |
| 4 | Script Guard | Tracks and fingerprints loaded scripts through the DevTools bridge |
| 5 | Behavior Monitor | Watches permissions, resource use, and anomalous page behavior |
| 6 | Gatekeeper | Queues ambiguous security decisions and supports human or agent review |
| 7 | Security Intelligence | Correlation, baselines, anomaly tracking, analyzers, and reporting |
| 8 | Prompt Injection Guard | Detects prompt-injection content before Tandem forwards page data to the agent |

## Prompt-Injection Layer

The prompt-injection layer has two parts:

- `PromptInjectionGuard` in `src/security/prompt-injection-guard.ts`
- `injectionScannerMiddleware` in `src/api/middleware/injection-scanner.ts`

### Routes scanned by the middleware

- `GET /page-content`
- `GET /page-html`
- `GET /snapshot`
- `GET /snapshot/text`
- `POST /execute-js`

### Response behavior

- Clean content: forwarded unchanged
- Risk score `30-69`: response is forwarded and Tandem adds an `injectionWarnings` object to the JSON payload
- Risk score `>= 70`: content is blocked and the original page payload is replaced with a blocked response unless the domain has an active override

### `injectionWarnings` payload

When warnings are attached, the response includes:

- `riskScore`
- `findingCount`
- `summary`
- `findings[]` with rule id, severity, category, description, and a short matched-text excerpt

### Blocking and override flow

- High-risk pages trigger an in-app alert and OS notification
- Tandem does not forward the original page content to the agent while blocked
- `POST /security/injection-override` grants a 5-minute per-domain override

## Useful Security Endpoints

- `GET /security/status`
- `GET /security/events`
- `GET /security/report`
- `GET /security/page/analysis`
- `GET /security/page/scripts`
- `GET /security/scripts/correlations`
- `GET /security/analyzers/status`
- `POST /security/injection-override`

## Related Docs

- [README](../../README.md)
- [docs/api-current.md](../api-current.md)
- [docs/security-upgrade/README.md](../security-upgrade/README.md)
