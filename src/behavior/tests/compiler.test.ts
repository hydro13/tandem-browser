import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above top-level consts, so the shared in-memory
// filesystem has to live inside vi.hoisted() to be reachable from the
// mock factory.
const { vfs } = vi.hoisted(() => ({ vfs: new Map<string, string>() }));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  const fs = {
    ...actual,
    existsSync: vi.fn((p: string) => {
      const s = String(p);
      if ([...vfs.keys()].some((k) => k === s || k.startsWith(s + '/'))) return true;
      return false;
    }),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn((p: string) => {
      const prefix = String(p).replace(/\/$/, '') + '/';
      const names = new Set<string>();
      for (const k of vfs.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          const name = rest.split('/')[0];
          names.add(name);
        }
      }
      return Array.from(names);
    }),
    readFileSync: vi.fn((p: string) => {
      const content = vfs.get(String(p));
      if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return content;
    }),
    writeFileSync: vi.fn((p: string, content: string) => {
      vfs.set(String(p), String(content));
    }),
    chmodSync: vi.fn(),
  };
  return { ...fs, default: fs };
});

vi.mock('../../utils/paths', () => ({
  tandemDir: vi.fn((...parts: string[]) => ['/tmp/tandem-test', ...parts].join('/')),
}));

import {
  BehaviorCompiler,
  filterOutliers,
  percentileTrim,
  computeStatsFromIntervals,
  extractIntervalsFromJsonl,
  OUTLIER_MIN_MS,
  OUTLIER_MAX_MS,
  SAMPLE_FLOOR,
} from '../compiler';

function seedKeypressJsonl(filename: string, intervals: number[]): void {
  const path = `/tmp/tandem-test/behavior/raw/${filename}`;
  const lines = intervals.map((interval, i) =>
    JSON.stringify({ type: 'keypress', ts: 1_000_000 + i, data: { interval } }),
  );
  vfs.set(path, lines.join('\n'));
}

function gaussianIntervals(count: number, mean: number, stddev: number, seed = 1): number[] {
  // Simple seeded PRNG so tests are deterministic.
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const out: number[] = [];
  for (let i = 0; i < count; i += 2) {
    const u1 = Math.max(rand(), 1e-10);
    const u2 = rand();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    out.push(Math.max(1, Math.round(mean + z0 * stddev)));
    if (out.length < count) out.push(Math.max(1, Math.round(mean + z1 * stddev)));
  }
  return out;
}

beforeEach(() => {
  vfs.clear();
  vi.clearAllMocks();
});

// ─── Pure helper tests ──────────────────────────────────────────

describe('filterOutliers()', () => {
  it(`drops intervals < ${OUTLIER_MIN_MS}ms (paste / key-repeat)`, () => {
    expect(filterOutliers([10, 29, 30, 50])).toEqual([30, 50]);
  });

  it(`drops intervals > ${OUTLIER_MAX_MS}ms (thinking pauses)`, () => {
    expect(filterOutliers([100, 200, 2001, 5000])).toEqual([100, 200]);
  });

  it('keeps intervals inside the acceptable band', () => {
    expect(filterOutliers([30, 200, 1999, 2000])).toEqual([30, 200, 1999, 2000]);
  });

  it('handles empty input', () => {
    expect(filterOutliers([])).toEqual([]);
  });
});

describe('percentileTrim()', () => {
  it('drops top and bottom 5% from an already-sorted array', () => {
    // 100 values 1..100 → drops 5 smallest and 5 largest → keeps 6..95
    const input = Array.from({ length: 100 }, (_, i) => i + 1);
    const out = percentileTrim(input);
    expect(out[0]).toBe(6);
    expect(out[out.length - 1]).toBe(95);
    expect(out.length).toBe(90);
  });

  it('returns input unchanged for very small arrays (nothing to trim)', () => {
    expect(percentileTrim([100, 200, 300]).length).toBeGreaterThanOrEqual(1);
  });
});

describe('computeStatsFromIntervals()', () => {
  it('computes meanWpm for a typical typist (mean ≈ 200 ms/key → 60 WPM)', () => {
    const intervals = Array.from({ length: 500 }, () => 200);
    const stats = computeStatsFromIntervals(intervals);
    expect(stats.meanWpm).toBeCloseTo(60, 0);
    expect(stats.samples).toBe(500);
  });

  it('computes a non-zero variance for jittery intervals', () => {
    const intervals = gaussianIntervals(500, 200, 40, 42);
    const stats = computeStatsFromIntervals(intervals);
    expect(stats.variance).toBeGreaterThan(20);
    expect(stats.variance).toBeLessThan(60);
  });

  it('returns variance=0 for a perfectly constant stream', () => {
    const intervals = Array.from({ length: 200 }, () => 150);
    expect(computeStatsFromIntervals(intervals).variance).toBe(0);
  });
});

// ─── JSONL parsing ──────────────────────────────────────────────

describe('extractIntervalsFromJsonl()', () => {
  it('pulls keypress intervals and ignores other event types', () => {
    const text = [
      JSON.stringify({ type: 'keypress', ts: 1, data: { interval: 150 } }),
      JSON.stringify({ type: 'scroll', ts: 2, data: { deltaY: 100 } }),
      JSON.stringify({ type: 'keypress', ts: 3, data: { interval: 200 } }),
      JSON.stringify({ type: 'navigate', ts: 4, data: { url: 'x' } }),
    ].join('\n');
    expect(extractIntervalsFromJsonl(text)).toEqual([150, 200]);
  });

  it('ignores keypress events with interval <= 0 (the "first press" records)', () => {
    const text = [
      JSON.stringify({ type: 'keypress', ts: 1, data: { interval: 0 } }),
      JSON.stringify({ type: 'keypress', ts: 2, data: { interval: -5 } }),
      JSON.stringify({ type: 'keypress', ts: 3, data: { interval: 180 } }),
    ].join('\n');
    expect(extractIntervalsFromJsonl(text)).toEqual([180]);
  });

  it('tolerates malformed JSONL lines without throwing', () => {
    const text = [
      'not-json',
      JSON.stringify({ type: 'keypress', ts: 1, data: { interval: 100 } }),
      '',
      '{broken',
      JSON.stringify({ type: 'keypress', ts: 2, data: { interval: 120 } }),
    ].join('\n');
    expect(extractIntervalsFromJsonl(text)).toEqual([100, 120]);
  });

  it('handles empty input', () => {
    expect(extractIntervalsFromJsonl('')).toEqual([]);
  });
});

// ─── compile() orchestration ────────────────────────────────────

describe('BehaviorCompiler.compile()', () => {
  it('returns default profile with source="default" when raw dir is empty / missing', () => {
    const compiler = new BehaviorCompiler();
    const profile = compiler.compile();
    expect(profile.source).toBe('default');
    expect(profile.typingSpeed.meanWpm).toBeGreaterThan(0);
    expect(profile.samples ?? 0).toBe(0);
  });

  it(`returns source="default-insufficient" when total intervals < ${SAMPLE_FLOOR}`, () => {
    seedKeypressJsonl('2026-04-19.jsonl', gaussianIntervals(50, 200, 30, 3));
    const compiler = new BehaviorCompiler();
    const profile = compiler.compile();
    expect(profile.source).toBe('default-insufficient');
    // Defaults still flow through so downstream replay works
    expect(profile.typingSpeed.meanWpm).toBeGreaterThan(0);
  });

  it('produces source="compiled" with real stats when enough sane samples exist', () => {
    seedKeypressJsonl('2026-04-19.jsonl', gaussianIntervals(500, 250, 50, 7)); // ≈ 48 WPM
    const compiler = new BehaviorCompiler();
    const profile = compiler.compile();
    expect(profile.source).toBe('compiled');
    expect(profile.typingSpeed.meanWpm).toBeGreaterThan(30);
    expect(profile.typingSpeed.meanWpm).toBeLessThan(75);
    expect(profile.samples).toBeGreaterThanOrEqual(SAMPLE_FLOOR);
    expect(typeof profile.lastCompiledAt).toBe('number');
  });

  it('aggregates intervals across multiple day files', () => {
    seedKeypressJsonl('2026-04-18.jsonl', gaussianIntervals(60, 200, 30, 11));
    seedKeypressJsonl('2026-04-19.jsonl', gaussianIntervals(60, 200, 30, 13));
    const compiler = new BehaviorCompiler();
    const profile = compiler.compile();
    // 60 + 60 = 120 samples → crosses the floor
    expect(profile.source).toBe('compiled');
  });

  it('trims outliers so a few paste-bursts or long pauses do not skew the mean', () => {
    const sane = gaussianIntervals(300, 200, 30, 17);
    // Inject obvious junk that should be dropped
    const withOutliers = [...sane, 5, 10, 5000, 10_000];
    seedKeypressJsonl('2026-04-19.jsonl', withOutliers);
    const compiler = new BehaviorCompiler();
    const profile = compiler.compile();
    expect(profile.source).toBe('compiled');
    // Without trim, 10_000ms outliers would yank the mean hard
    expect(profile.typingSpeed.meanWpm).toBeGreaterThan(40);
    expect(profile.typingSpeed.meanWpm).toBeLessThan(80);
  });

  it('falls back to default-insufficient when computed meanWpm is outside [20, 150]', () => {
    // 500 samples all at 5ms → ridiculous WPM, should be rejected as paste noise
    // (after outlier filter drops <30ms, we'll end up with 0 samples anyway —
    //  but also test the sane-range branch explicitly with samples that
    //  survive the filter but produce an insane mean)
    const bogus = Array.from({ length: 500 }, () => 31); // just inside the min, crazy-fast ~387 WPM
    seedKeypressJsonl('2026-04-19.jsonl', bogus);
    const compiler = new BehaviorCompiler();
    const profile = compiler.compile();
    expect(profile.source).toBe('default-insufficient');
  });

  it('writes the compiled profile to disk', () => {
    seedKeypressJsonl('2026-04-19.jsonl', gaussianIntervals(500, 200, 30, 23));
    const compiler = new BehaviorCompiler();
    compiler.compile();
    const written = vfs.get('/tmp/tandem-test/behavior/profile.json');
    expect(written).toBeDefined();
    const parsed = JSON.parse(written!);
    expect(parsed.source).toBe('compiled');
  });

  it('getProfile() returns the persisted profile when available', () => {
    const payload = {
      typingSpeed: { meanWpm: 72, variance: 33 },
      mouseMovement: { curveBias: 'ease-in-out', averageSpeedPxPerMs: 1.2 },
      source: 'compiled',
      samples: 500,
      lastCompiledAt: 1_700_000_000_000,
    };
    vfs.set('/tmp/tandem-test/behavior/profile.json', JSON.stringify(payload));
    const compiler = new BehaviorCompiler();
    const profile = compiler.getProfile();
    expect(profile.typingSpeed.meanWpm).toBe(72);
    expect(profile.source).toBe('compiled');
  });

  it('getProfile() falls back to compile() when profile.json is missing', () => {
    const compiler = new BehaviorCompiler();
    const profile = compiler.getProfile();
    expect(profile.source).toBe('default');
  });
});
