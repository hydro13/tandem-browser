# Tandem Security Reference Analysis — Claude's Rapport
*24 feb 2026*

## Methodologie

Volledige broncode gelezen van:
- Alle 13 security-bestanden in Tandem (`src/security/`)
- De volledige azul-bedrock repo (Go + Python plugin framework, YARA rules, identify pipeline, event systeem)
- CyberChef's core architectuur + 25+ security-relevante operations (regexes, file signatures, entropy)
- Ghidra's analyzer pipeline, BSim fingerprinting engine, call graph, ML classifier, en constraint systeem

---

## Deel 1: Review van Kees's Rapport

Kees heeft goed werk gedaan maar er zijn punten waar ik afwijk of correcties heb:

### Waar Kees gelijk heeft:
- **YARA-style rules (#1)** — Correct: ContentAnalyzer gebruikt nu alleen DOM/CSS heuristieken (hidden iframes, forms, mixed content, typosquatting). Er is GEEN statische JavaScript source-analyse. Dit is een gat.
- **Trusted MIME whitelist (#2)** — Goed idee, correct geidentificeerd.
- **Plugin Architecture (#3)** — Het concept is juist, maar Kees schrijft het toe aan Azul terwijl Ghidra's `Analyzer` interface eigenlijk een beter model is.

### Waar Kees te kort door de bocht gaat:

**1. De YARA patterns die Kees noemt komen NIET uit Azul's YARA rules.**
Azul's `yara_rules.yar` bevat 40+ regels voor **bestandstype identificatie** (is dit JavaScript? VBScript? PowerShell?), niet voor **threat detection**. De `code_javascript` YARA rule identificeert of een bestand JavaScript is — met patterns als `eval()`, `ActiveXObject`, `createElement()` — maar scoort geen dreigingsniveau. Kees heeft de Azul-patterns vertaald naar dreigingsregels, wat een goede adaptatie is, maar het is niet "direct overgenomen van Azul."

**2. Cross-domain script fingerprinting (#4) — Tandem heeft dit al half.**
`ScriptGuard` tracked al script URL+hash per domein in de `script_fingerprints` tabel, en detecteert nieuwe scripts op bekende domeinen. Wat ontbreekt is de **cross-domein correlatie** (dezelfde hash op meerdere domeinen). Kees presenteert het alsof het helemaal nieuw moet, maar het is een extensie van bestaande functionaliteit.

**3. CyberChef pipeline (#5) — Verkeerde metafoor.**
CyberChef is een **data transformatie** pipeline (input -> decode -> extract -> output). Tandem's security is een **event-driven decision** pipeline (request -> check -> score -> allow/block). Je "transformeert" geen pagina door security operations — je analyseert en beslist. De CyberChef regexes en detectie-logica zijn waardevol, maar de pipeline-architectuur zelf past niet.

**4. Ghidra (#6) — Kees mist het meest waardevolle.**
Kees zegt "call graphs voor BehaviorMonitor, ver weg." Maar het werkelijk waardevolle uit Ghidra is **BSim's iteratieve graph-hashing** voor obfuscatie-resistente fingerprints. Dit is een concreet algoritme dat vertaalbaar is naar JavaScript AST-analyse. Daarnaast: Ghidra's `AnalysisPriority` model (confidence-gewogen pipeline) en de Random Forest ML classifier zijn direct toepasbaar.

### Wat Kees helemaal gemist heeft:

1. **Shannon Entropy analyse** (CyberChef) — High entropy in script content = sterke obfuscatie indicator. Tandem meet dit nergens.
2. **CyberChef's Magic auto-detect systeem** — Speculatieve executie die encoding/obfuscatie automatisch herkent.
3. **CyberChef's battle-tested regex patterns** — URL, domein, IP, email extractie regexes gebruikt door de hele security community.
4. **Bestaande bugs/zwakheden in Tandem** die de reference repos blootleggen (duplicate lijsten, cookie_count=0, correlateEvents() nooit aangeroepen, geen blocklist scheduling).
5. **Azul's depth-limiting** — Bescherming tegen recursive extraction bombs.

---

## Deel 2: Tandem's Huidige Staat

### 5-Fase Security Systeem

| Fase | Modules | Werkt op |
|------|---------|----------|
| 1 - Network | Guardian + NetworkShield | Elke HTTP request (sync, <5ms) |
| 2 - Outbound | OutboundGuard | POST/PUT/PATCH requests |
| 3 - Runtime | ScriptGuard + ContentAnalyzer + BehaviorMonitor | CDP events + page DOM |
| 4 - AI Bridge | GatekeeperWebSocket | Async AI agent decisies |
| 5 - Learning | EvolutionEngine + ThreatIntel + BlocklistUpdater | Baselines + rapportage |

### Bestanden

| Bestand | Functie |
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
- Non-blocking AI integration — Gatekeeper is async, geen latency impact
- CDP-level monitor injection — onzichtbaar voor pagina-scripts via `Runtime.addBinding`
- Asymmetrische trust — langzaam omhoog (+1/visit), snel omlaag (-10/-15 op anomalie)
- Prepared statement performance — alle DB hot paths pre-compiled

### Zwakheden
1. **Geen statische script-analyse** — ScriptGuard tracked scripts maar analyseert de inhoud niet
2. **Duplicate hardcoded lijsten** — KNOWN_TRACKERS en URL_LIST_SAFE_DOMAINS elk in 2 bestanden
3. **cookie_count altijd 0** — veld bestaat maar wordt nooit gevuld
4. **correlateEvents() nooit aangeroepen** — code bestaat maar wordt niet getriggerd
5. **Geen blocklist update scheduling** — moet handmatig via API getriggerd worden
6. **Monitor injection race condition** — scripts die laden voor CDP command compleet is worden gemist

---

## Deel 3: Aanbevelingen

### HOGE PRIORITEIT

#### 1. Declaratief Rule Systeem voor Script Content Analyse
**Bron:** Azul YARA rule structuur (aangepast) + CyberChef check patterns
**Effort:** 1-2 dagen | **Impact:** Hoog

Rule engine die draait op script source code via CDP `Debugger.getScriptSource`. Bevat compound patterns (bv. `document.cookie` + `fetch()` binnen proximity = critical) naast single patterns. Rules zijn declaratief en uitbreidbaar zonder code-wijzigingen.

#### 2. Shannon Entropy Check op Script Content
**Bron:** CyberChef `Entropy.mjs`
**Effort:** Uur | **Impact:** Medium-Hoog

Vangt geobfusceerde scripts die specifiek ontworpen zijn om regex-rules te ontwijken. Normale JS = 4.5-5.5 bits, obfuscated = 5.8-6.5 bits, encrypted = 7.5-8.0 bits.

#### 3. Trusted Content-Type Whitelist voor OutboundGuard
**Bron:** Azul `trusted_mime.yaml` concept
**Effort:** Uur | **Impact:** Medium

Skip body scanning voor media uploads (image/*, audio/*, video/*, font/*). NIET voor application/json of x-www-form-urlencoded.

#### 4. Fix Bestaande Zwakheden
**Effort:** 1 dag | **Impact:** Hoog

- Dedupliceer KNOWN_TRACKERS en URL_LIST_SAFE_DOMAINS naar types.ts
- Wire cookie_count via Guardian's analyzeResponseHeaders()
- Auto-trigger correlateEvents() (per 100 events of per uur)
- Blocklist update scheduling (setInterval elke 24 uur)

### MEDIUM PRIORITEIT

#### 5. Cross-Domein Script Correlatie
**Bron:** Azul feature model + Tandem's bestaande script_fingerprints
**Effort:** 2-3 dagen | **Impact:** Hoog

Extend bestaande fingerprinting met cross-domein lookup: als een script hash verschijnt die ook op geblokkeerde domeinen staat -> automatisch hoge score.

#### 6. CyberChef Regex Patterns Overnemen
**Bron:** CyberChef Extract.mjs, ExtractIPAddresses.mjs
**Effort:** 1-2 dagen | **Impact:** Medium

Battle-tested URL, domein, IP extractie regexes. Inclusief octal IP detectie (evasie techniek).

#### 7. Confidence-Gewogen Pipeline Ordering
**Bron:** Ghidra AnalysisPriority
**Effort:** 1 dag | **Impact:** Medium

Numerieke confidence levels per detection type. Blocklist=100, credential exfil=200, heuristic=700, speculative=900. Bepaalt of iets lokaal resolved wordt of naar Gatekeeper AI gaat.

### LANGE TERMIJN

#### 8. AST-Based Script Fingerprinting
**Bron:** Ghidra BSim signature.hh — iteratieve graph hashing
**Effort:** Week+ | **Impact:** Hoog

Parse JS naar AST (Acorn), hash structurele vorm onafhankelijk van variabelnamen/constanten. Twee semantisch identieke maar syntactisch verschillende obfuscaties produceren dezelfde fingerprint.

#### 9. Security Plugin Architectuur
**Bron:** Ghidra Analyzer interface
**Effort:** Week+ | **Impact:** Schaalbaarheid

Event-driven, priority-ordered SecurityAnalyzer interface. Community kan analyzers bijdragen als losse bestanden.

---

## Prioriteiten Overzicht

| # | Wat | Bron | Effort | Impact | Kees? |
|---|-----|------|--------|--------|-------|
| 1 | Declaratief rule systeem voor JS content | Azul YARA + eigen | 1-2 dagen | Hoog | Ja, maar te simpel |
| 2 | Shannon entropy check | CyberChef | Uur | Medium-Hoog | Nee |
| 3 | Trusted Content-Type whitelist | Azul concept | Uur | Medium | Ja |
| 4 | Fix bestaande zwakheden | Eigen analyse | 1 dag | Hoog | Nee |
| 5 | Cross-domein script correlatie | Azul + bestaand | 2-3 dagen | Hoog | Deels |
| 6 | CyberChef regex patterns overnemen | CyberChef | 1-2 dagen | Medium | Nee |
| 7 | Confidence-gewogen pipeline | Ghidra | 1 dag | Medium | Nee |
| 8 | AST-based script fingerprinting | Ghidra BSim | Week+ | Hoog | Nee |
| 9 | Security plugin architectuur | Ghidra Analyzer | Week+ | Schaal | Verkeerde bron |

**Advies:** #4 + #2 + #3 als quick wins. Dan #1 en #5 als high-impact features. #6 en #7 parallel daarna. #8 als moonshot.
