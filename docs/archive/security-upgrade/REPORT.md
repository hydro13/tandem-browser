# Tandem Security Reference Analysis — Claude's Rapport
*24 feb 2026*

## Methodologie

Volledige broncode gelezen or:
- Alle 13 security-files in Tandem (`src/security/`)
- The full azul-bedrock repo (Go + Python plugin framework, YARA rules, identify pipeline, event system)
- CyberChef's core architectuur + 25+ security-relevante operations (regexes, file signatures, entropy)
- Ghidra's analyzer pipeline, BSim fingerprinting engine, call graph, ML classifier, and constraint system

---

## Deel 1: Review or Kees's Rapport

Kees has goed werk gedaan but er are punten waar ik afwijk or correcties heb:

### Waar Kees gelijk has:
- **YARA-style rules (#1)** — Correct: `ContentAnalyzer` currently uses only DOM/CSS heuristics (hidden iframes, forms, mixed content, typosquatting). There is NO static JavaScript source analysis. This is a gap.
- **Trusted MIME whitelist (#2)** — Goed idee, correct geidentificeerd.
- **Plugin Architecture (#3)** — The concept is juist, but Kees schrijft the toe about Azul terwijl Ghidra's `Analyzer` interface eigenlijk a beter model is.

### Waar Kees te kort door the bocht gaat:

**1. The YARA patterns that Kees noemt komen NIET out Azul's YARA rules.**
Azul's `yara_rules.yar` contains 40+ rules for **file-type identification** (is this JavaScript? VBScript? PowerShell?), not for **threat detection**. The `code_javascript` YARA rule identifies whether a file is JavaScript, with patterns such as `eval()`, `ActiveXObject`, and `createElement()`, but it does not score a threat level. Kees translated the Azul patterns into threat rules, which is a good adaptation, but it is not "directly taken from Azul."

**2. Cross-domain script fingerprinting (#4) — Tandem has this already half.**
`ScriptGuard` tracked already script URL+hash per domain in the `script_fingerprints` tabel, and detecteert new scripts op bekende domains. Wat ontbreekt is the **cross-domain correlatie** (the same hash op multiple domains). Kees presenteert the alsof the helemaal new must, but the is a extensie or existing functionaliteit.

**3. CyberChef pipeline (#5) — Verkeerde metafoor.**
CyberChef is a **data transformatie** pipeline (input -> decode -> extract -> output). Tandem's security is a **event-driven decision** pipeline (request -> check -> score -> allow/block). You "transformeert" no page door security operations — you analyseert and beslist. The CyberChef regexes and detection-logica are waardevol, but the pipeline-architectuur zelf past not.

**4. Ghidra (#6) — Kees mist the meest waardevolle.**
Kees zegt "call graphs for BehaviorMonitor, ver weg." Maar the werkelijk waardevolle out Ghidra is **BSim's iteratieve graph-hashing** for obfuscatie-resistente fingerprints. Dit is a concreet algoritme that vertaalbaar is to JavaScript AST-analyse. Daarnaast: Ghidra's `AnalysisPriority` model (confidence-gewogen pipeline) and the Random Forest ML classifier are direct toepasbaar.

### Wat Kees helemaal gemist has:

1. **Shannon Entropy analyse** (CyberChef) — High entropy in script content = sterke obfuscatie indicator. Tandem meet this nergens.
2. **CyberChef's Magic auto-detect system** — Speculatieve executie that encoding/obfuscatie automatisch herkent.
3. **CyberChef's battle-tested regex patterns** — URL, domain, IP, email extractie regexes uses door the hele security community.
4. **Existing bugs/zwakheden in Tandem** that the reference repos blootleggen (duplicate lijsten, cookie_count=0, correlateEvents() nooit aangeroepen, no blocklist scheduling).
5. **Azul's depth-limiting** — Bescherming tegen recursive extraction bombs.

---

## Deel 2: Tandem's Huidige Staat

### 5-Phase Security System

| Phase | Modules | Works op |
|------|---------|----------|
| 1 - Network | Guardian + NetworkShield | Elke HTTP request (sync, <5ms) |
| 2 - Outbound | OutboundGuard | POST/PUT/PATCH requests |
| 3 - Runtime | ScriptGuard + ContentAnalyzer + BehaviorMonitor | CDP events + page DOM |
| 4 - AI Bridge | GatekeeperWebSocket | Async AI agent decisies |
| 5 - Learning | EvolutionEngine + ThreatIntel + BlocklistUpdater | Baselines + rapportage |

### Files

| File | Function |
|---------|---------|
| `src/security/security-manager.ts` | Orchestrator (32 API routes, lifecycle management) |
| `src/security/security-db.ts` | SQLite persistence (6 tabellen, 40+ prepared statements) |
| `src/security/types.ts` | Alle shared TypeScript interfaces |
| `src/security/guardian.ts` | Phase 1: Network request interceptor |
| `src/security/network-shield.ts` | Phase 1: Domain blocklist (in-memory Set) |
| `src/security/outbound-guard.ts` | Phase 2: Outbound data exfiltration guard |
| `src/security/script-guard.ts` | Phase 3: CDP-based script analysis + monitor injection |
| `src/security/content-analyzer.ts` | Phase 3: Page-level phishing/tracker analysis |
| `src/security/behavior-monitor.ts` | Phase 3: Permission handler + CPU monitoring |
| `src/security/gatekeeper-ws.ts` | Phase 4: AI agent WebSocket bridge |
| `src/security/evolution.ts` | Phase 5: Baseline learning + anomaly detection |
| `src/security/threat-intel.ts` | Phase 5: Report generation + event correlation |
| `src/security/blocklists/updater.ts` | Phase 5: Automated blocklist downloading |

### Sterke punten
- Layered defense — vijf lagen vangen elk andere dreigingsvectoren
- Non-blocking AI integration — Gatekeeper is async, no latency impact
- CDP-level monitor injection — onzichtbaar for page-scripts via `Runtime.addBinding`
- Asymmetrische trust — langzaam omhoog (+1/visit), snel omlaag (-10/-15 op anomalie)
- Prepared statement performance — alle DB hot paths pre-compiled

### Zwakheden
1. **No statische script-analyse** — ScriptGuard tracked scripts but analyseert the inhoud not
2. **Duplicate hardcoded lijsten** — KNOWN_TRACKERS and URL_LIST_SAFE_DOMAINS elk in 2 files
3. **cookie_count always 0** — field exists but is nooit gevuld
4. **correlateEvents() nooit aangeroepen** — code exists but is not getriggerd
5. **No blocklist update scheduling** — must handmatig via API getriggerd be
6. **Monitor injection race condition** — scripts that laden for CDP command compleet is be gemist

---

## Deel 3: Aanbevelingen

### HOGE PRIORITEIT

#### 1. Declaratief Rule System for Script Content Analyse
**Bron:** Azul YARA rule structuur (aangepast) + CyberChef check patterns
**Effort:** 1-2 dagen | **Impact:** Hoog

Rule engine that draait op script source code via CDP `Debugger.getScriptSource`. Contains compound patterns (bv. `document.cookie` + `fetch()` within proximity = critical) next to single patterns. Rules are declaratief and uitbreidbaar without code-wijzigingen.

#### 2. Shannon Entropy Check op Script Content
**Bron:** CyberChef `Entropy.mjs`
**Effort:** Uur | **Impact:** Medium-Hoog

Vangt geobfusceerde scripts that specifiek ontworpen are to regex-rules te ontwijken. Normale JS = 4.5-5.5 bits, obfuscated = 5.8-6.5 bits, encrypted = 7.5-8.0 bits.

#### 3. Trusted Content-Type Whitelist for OutboundGuard
**Bron:** Azul `trusted_mime.yaml` concept
**Effort:** Uur | **Impact:** Medium

Skip body scanning for media uploads (image/*, audio/*, video/*, font/*). NIET for application/json or x-www-form-urlencoded.

#### 4. Fix Existing Zwakheden
**Effort:** 1 dag | **Impact:** Hoog

- Dedupliceer KNOWN_TRACKERS and URL_LIST_SAFE_DOMAINS to types.ts
- Wire cookie_count via Guardian's analyzeResponseHeaders()
- Auto-trigger correlateEvents() (per 100 events or per uur)
- Blocklist update scheduling (setInterval elke 24 uur)

### MEDIUM PRIORITEIT

#### 5. Cross-Domein Script Correlatie
**Bron:** Azul feature model + Tandem's existing script_fingerprints
**Effort:** 2-3 dagen | **Impact:** Hoog

Extend existing fingerprinting with cross-domain lookup: if a script hash appears that also op geblokkeerde domains staat -> automatisch hoge score.

#### 6. CyberChef Regex Patterns Overnemen
**Bron:** CyberChef Extract.mjs, ExtractIPAddresses.mjs
**Effort:** 1-2 dagen | **Impact:** Medium

Battle-tested URL, domain, IP extractie regexes. Inclusief octal IP detection (evasie techniek).

#### 7. Confidence-Gewogen Pipeline Ordering
**Bron:** Ghidra AnalysisPriority
**Effort:** 1 dag | **Impact:** Medium

Numerieke confidence levels per detection type. Blocklist=100, credential exfil=200, heuristic=700, speculative=900. Bepaalt or iets local resolved is or to Gatekeeper AI gaat.

### LANGE TERMIJN

#### 8. AST-Based Script Fingerprinting
**Bron:** Ghidra BSim signature.hh — iteratieve graph hashing
**Effort:** Week+ | **Impact:** Hoog

Parse JS to AST (Acorn), hash structurele vorm onafhankelijk or variabelnamen/constanten. Twee semantisch identieke but syntactisch verschillende obfuscaties produceren the same fingerprint.

#### 9. Security Plugin Architectuur
**Bron:** Ghidra Analyzer interface
**Effort:** Week+ | **Impact:** Schaalbaarheid

Event-driven, priority-ordered SecurityAnalyzer interface. Community can analyzers bijdragen if losse files.

---

## Prioriteiten Overzicht

| # | Wat | Bron | Effort | Impact | Kees? |
|---|-----|------|--------|--------|-------|
| 1 | Declaratief rule system for JS content | Azul YARA + own | 1-2 dagen | Hoog | Ja, but te simpel |
| 2 | Shannon entropy check | CyberChef | Uur | Medium-Hoog | Nee |
| 3 | Trusted Content-Type whitelist | Azul concept | Uur | Medium | Ja |
| 4 | Fix existing zwakheden | Own analyse | 1 dag | Hoog | Nee |
| 5 | Cross-domain script correlatie | Azul + bestaand | 2-3 dagen | Hoog | Deels |
| 6 | CyberChef regex patterns overnemen | CyberChef | 1-2 dagen | Medium | Nee |
| 7 | Confidence-gewogen pipeline | Ghidra | 1 dag | Medium | Nee |
| 8 | AST-based script fingerprinting | Ghidra BSim | Week+ | Hoog | Nee |
| 9 | Security plugin architectuur | Ghidra Analyzer | Week+ | Schaal | Verkeerde bron |

**Advies:** #4 + #2 + #3 if quick wins. Then #1 and #5 if high-impact features. #6 and #7 parallel after that. #8 if moonshot.
