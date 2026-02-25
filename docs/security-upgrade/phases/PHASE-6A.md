# Phase 6-A: Acorn Parser + AST Hash Algorithm

> **Priority:** LOW-MEDIUM | **Effort:** ~2 hours | **Dependencies:** Phase 3-A (fingerprinting DB)

## Goal
Integrate the Acorn JavaScript parser and implement the iterative AST hash algorithm (inspired by Ghidra's BSim). This produces obfuscation-resistant fingerprints where structurally identical scripts produce the same hash regardless of variable names or constants.

## Files to Read
- `src/security/script-guard.ts` — current fingerprinting flow, where AST hashing integrates
- `src/security/security-db.ts` — `script_fingerprints` table (Phase 3-B added `normalized_hash`)

## Files to Modify
- `src/security/script-guard.ts` — add AST parsing + hashing functions
- `src/security/security-db.ts` — add `ast_hash` column
- `package.json` — add `acorn` dependency

## Tasks

### 6A.1 Install Acorn parser

```bash
npm install acorn
npm install --save-dev @types/acorn
```

Acorn is a lightweight (~40KB) JavaScript parser used by ESLint, webpack, and Rollup. It produces a standard ESTree-compatible AST.

**Document this dependency in STATUS.md.**

### 6A.2 Add `ast_hash` column to DB

In `security-db.ts`:
```sql
ALTER TABLE script_fingerprints ADD COLUMN ast_hash TEXT
```

Safe migration (try/catch). Add index:
```sql
CREATE INDEX IF NOT EXISTS idx_script_fingerprints_ast_hash ON script_fingerprints(ast_hash)
```

### 6A.3 Implement AST parsing utility

In `script-guard.ts`:

```typescript
import * as acorn from 'acorn'

function parseToAST(source: string): acorn.Node | null {
  try {
    return acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      // Tolerate some syntax issues
      onComment: () => {},
    })
  } catch {
    // Syntax error — return null, fall back to regular hash
    return null
  }
}
```

### 6A.4 Implement iterative AST hash algorithm

Inspired by Ghidra BSim's iterative graph hashing:

```typescript
import { createHash } from 'crypto'

function computeASTHash(node: acorn.Node): string {
  const features: string[] = []
  walkAST(node, features)
  return createHash('sha256').update(features.join('|')).digest('hex').substring(0, 32)
}

function walkAST(node: any, features: string[]): void {
  if (!node || typeof node !== 'object') return

  // Hash node type + structural properties (NOT values)
  if (node.type) {
    const feature = buildNodeFeature(node)
    features.push(feature)
  }

  // Recurse into child nodes
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'raw') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) {
          walkAST(item, features)
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkAST(child, features)
    }
  }
}

function buildNodeFeature(node: any): string {
  // Include structural info, exclude variable names and literal values
  const parts = [node.type]

  // Operators are structural
  if (node.operator) parts.push(node.operator)

  // Property count (arity) matters
  if (node.params) parts.push(`params:${node.params.length}`)
  if (node.arguments) parts.push(`args:${node.arguments.length}`)

  // Control flow structure
  if (node.consequent) parts.push('has:consequent')
  if (node.alternate) parts.push('has:alternate')

  // Function characteristics
  if (node.async) parts.push('async')
  if (node.generator) parts.push('generator')

  return parts.join(':')
}
```

**Key design decisions:**
- Variable names are EXCLUDED (identifier nodes only record their existence, not their name)
- Literal values are EXCLUDED (a string "hello" and "world" produce the same feature)
- Operators ARE included (+ vs - changes semantics)
- Control flow structure IS included (if/else vs switch)
- Parameter/argument counts ARE included (arity matters)

### 6A.5 Wire into fingerprinting flow

In ScriptGuard's fingerprint storage:
1. After computing regular hash (and normalized hash from Phase 3-B)
2. Parse source to AST: `const ast = parseToAST(source)`
3. If parse succeeds: `const astHash = computeASTHash(ast)`
4. Store `ast_hash` alongside other hashes in `script_fingerprints`
5. If parse fails (syntax error): store `null` for `ast_hash` — degrade gracefully

**Size limit:** Only attempt AST parsing on scripts < 200KB (`MAX_AST_PARSE_SIZE`). Larger scripts are too expensive to parse synchronously.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Acorn parser installed and importable
- [ ] AST hash algorithm produces consistent hashes for same structure
- [ ] Two scripts with different variable names but same structure → same AST hash
- [ ] Two scripts with different structure → different AST hash
- [ ] Scripts with syntax errors degrade gracefully (ast_hash = null, regular hash still works)
- [ ] `ast_hash` column exists in `script_fingerprints`
- [ ] Scripts > 200KB skip AST parsing (performance)
- [ ] App still starts, browsing works
- [ ] Phase 0-5 changes still work (regression)

## Scope
- ONLY modify `script-guard.ts`, `security-db.ts`, `package.json`
- Do NOT implement cross-domain AST lookup (that's Phase 6-B)
- Do NOT implement similarity matching (that's Phase 6-B)
- Do NOT modify existing hash-based fingerprinting — AST hash is ADDITIVE

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
