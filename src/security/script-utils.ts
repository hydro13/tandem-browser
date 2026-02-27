import { createHash } from 'crypto';
import * as acorn from 'acorn';

/** Shannon entropy (bits per character) — detects obfuscated/encrypted content @internal */
export function calculateEntropy(input: string): number {
  if (input.length === 0) return 0;
  const freq = new Map<number, number>();
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    freq.set(code, (freq.get(code) || 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / input.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Strip comments and normalize whitespace for obfuscation-resistant hashing @internal */
export function normalizeScriptSource(source: string): string {
  return source
    .replace(/\/\/[^\n]*/g, '')           // strip single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // strip multi-line comments
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .trim();
}

// Phase 6-A: AST parsing + hashing (Ghidra BSim-inspired obfuscation-resistant fingerprinting)

/** Loosely-typed AST node — acorn's Node type only exposes type/start/end, but subtypes have arbitrary properties */
type ASTNode = Record<string, unknown> & { type?: string };

/** Build a structural feature string for a single AST node (excludes variable names and literal values) */
function buildNodeFeature(node: ASTNode): string {
  const parts: unknown[] = [node.type];

  // Operators are structural
  if (node.operator) parts.push(node.operator);

  // Parameter/argument count (arity)
  if (Array.isArray(node.params)) parts.push(`params:${node.params.length}`);
  if (Array.isArray(node.arguments)) parts.push(`args:${node.arguments.length}`);

  // Control flow structure
  if (node.consequent) parts.push('has:consequent');
  if (node.alternate) parts.push('has:alternate');

  // Function characteristics
  if (node.async) parts.push('async');
  if (node.generator) parts.push('generator');

  return parts.join(':');
}

/** Recursively walk AST and collect structural feature strings */
function walkAST(node: ASTNode, features: string[]): void {
  if (!node || typeof node !== 'object') return;

  if (node.type) {
    features.push(buildNodeFeature(node));
  }

  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'raw') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && (item as ASTNode).type) {
          walkAST(item as ASTNode, features);
        }
      }
    } else if (child && typeof child === 'object' && (child as ASTNode).type) {
      walkAST(child as ASTNode, features);
    }
  }
}

/** Compute obfuscation-resistant AST hash (Ghidra BSim-inspired iterative graph hashing) @internal */
export function computeASTHash(node: acorn.Node): string {
  const features: string[] = [];
  walkAST(node as unknown as ASTNode, features);
  return createHash('sha256').update(features.join('|')).digest('hex').substring(0, 32);
}

// Phase 6-B: Similarity scoring — cosine similarity between AST feature vectors

function walkForFeatures(node: ASTNode, features: Map<string, number>): void {
  if (!node || typeof node !== 'object') return;
  if (node.type) {
    const feature = buildNodeFeature(node);
    features.set(feature, (features.get(feature) || 0) + 1);
  }
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'raw') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && (item as ASTNode).type) {
          walkForFeatures(item as ASTNode, features);
        }
      }
    } else if (child && typeof child === 'object' && (child as ASTNode).type) {
      walkForFeatures(child as ASTNode, features);
    }
  }
}

/** Build AST feature vector: count occurrences of each node type/structural feature */
export function computeASTFeatureVector(node: acorn.Node): Map<string, number> {
  const features = new Map<string, number>();
  walkForFeatures(node as unknown as ASTNode, features);
  return features;
}

/** Cosine similarity between two feature vectors (0 = completely different, 1 = identical) @internal */
export function computeSimilarity(vec1: Map<string, number>, vec2: Map<string, number>): number {
  const allKeys = new Set([...vec1.keys(), ...vec2.keys()]);
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (const key of allKeys) {
    const a = vec1.get(key) || 0;
    const b = vec2.get(key) || 0;
    dotProduct += a * b;
    norm1 += a * a;
    norm2 += b * b;
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/** Parse JavaScript source to AST using Acorn. Returns null on syntax errors. */
export function parseToAST(source: string): acorn.Node | null {
  try {
    return acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
    });
  } catch {
    return null;
  }
}
