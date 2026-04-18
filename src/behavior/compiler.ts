import * as fs from 'fs';
import * as path from 'path';
import { tandemDir } from '../utils/paths';

/**
 * BehaviorCompiler — turns the BehaviorObserver's raw JSONL stream into
 * a per-user behavioural profile that BehaviorReplay can sample to mimic
 * this human's typing rhythm (and, later, mouse behaviour) when the agent
 * acts on a page.
 *
 * Historically this file was a stub: compile() ignored the raw data and
 * always wrote a hardcoded 85-WPM / ease-in-out / 1.2 px/ms profile, so
 * every install ended up with the same "average typist" fingerprint. That
 * defeats the purpose of observing the user. This version reads the raw
 * JSONL and computes real statistics; mouse-trajectory learning is still
 * on defaults and will be implemented in a later pass (design notes in
 * docs/superpowers/behavior-compiler-design.md, phase 2).
 */

// ─── Public tuning constants (exported for tests) ──────────────────

/** Drop intervals below this — paste-bursts or key-repeat noise. */
export const OUTLIER_MIN_MS = 30;
/** Drop intervals above this — thinking pauses, not typing rhythm. */
export const OUTLIER_MAX_MS = 2000;
/** Minimum number of sane intervals before we trust the compiled stats. */
export const SAMPLE_FLOOR = 100;
/** Sanity check: reject compiled means that imply an impossible human rate. */
export const SANE_WPM_MIN = 20;
export const SANE_WPM_MAX = 150;
/** Fraction trimmed from the top and bottom before mean/stddev. */
const PERCENTILE_TRIM_FRACTION = 0.05;

// ─── Types ──────────────────────────────────────────────────────────

export type BehaviorProfileSource = 'default' | 'default-insufficient' | 'compiled';

export interface BehavioralProfile {
  typingSpeed: {
    meanWpm: number;
    variance: number;
  };
  mouseMovement: {
    curveBias: 'linear' | 'ease-in-out' | 'ease-out';
    averageSpeedPxPerMs: number;
  };
  // Observability fields — additive, BehaviorReplay does not read them.
  source?: BehaviorProfileSource;
  samples?: number;
  lastCompiledAt?: number;
}

interface KeypressEvent {
  type: 'keypress';
  ts: number;
  data?: { interval?: number };
}

// ─── Pure helpers (exported for unit tests) ────────────────────────

/**
 * Drop intervals outside the band of plausibly-typed keystrokes. Paste
 * bursts come in as near-zero intervals, thinking pauses come in as
 * multi-second ones; neither represents the user's actual rhythm.
 */
export function filterOutliers(intervals: number[]): number[] {
  return intervals.filter((i) => i >= OUTLIER_MIN_MS && i <= OUTLIER_MAX_MS);
}

/**
 * Trim 5% off the top and bottom of a sorted ascending array so a few
 * remaining stragglers don't skew mean/variance. Returns the middle 90%.
 * Returns the input unchanged for very small arrays where trimming would
 * leave us with nothing.
 */
export function percentileTrim(sorted: number[]): number[] {
  if (sorted.length < 20) return sorted.slice();
  const n = sorted.length;
  const cut = Math.floor(n * PERCENTILE_TRIM_FRACTION);
  return sorted.slice(cut, n - cut);
}

/**
 * Turn a list of keypress intervals (ms between consecutive keys) into
 * summary statistics. meanWpm follows the 5-chars-per-word convention;
 * variance is the stddev of the intervals in ms, matching the field
 * BehaviorReplay.getTypingDelay uses as additive noise amplitude.
 *
 * The caller is expected to have already dropped outliers and percentile-
 * trimmed; this helper just crunches numbers.
 */
export function computeStatsFromIntervals(intervals: number[]): {
  meanWpm: number;
  variance: number;
  samples: number;
} {
  const samples = intervals.length;
  if (samples === 0) return { meanWpm: 0, variance: 0, samples: 0 };

  const sum = intervals.reduce((a, b) => a + b, 0);
  const meanMsPerKey = sum / samples;
  const cpm = 60_000 / meanMsPerKey;
  const meanWpm = cpm / 5;

  let variance = 0;
  if (samples > 1) {
    let sqSum = 0;
    for (const v of intervals) {
      const d = v - meanMsPerKey;
      sqSum += d * d;
    }
    variance = Math.sqrt(sqSum / samples);
  }

  return {
    meanWpm: Math.round(meanWpm * 10) / 10,
    variance: Math.round(variance * 10) / 10,
    samples,
  };
}

/**
 * Extract only valid keypress intervals from a JSONL blob. Tolerates
 * malformed lines and ignores every other event type. Keypress events
 * whose interval is missing or non-positive are skipped — those come
 * from either the first-press-of-session (no previous timestamp) or
 * events that pre-date the #168 observer fix.
 */
export function extractIntervalsFromJsonl(text: string): number[] {
  const out: number[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const event = parsed as KeypressEvent;
    if (event.type !== 'keypress') continue;
    const interval = event.data?.interval;
    if (typeof interval !== 'number' || !Number.isFinite(interval) || interval <= 0) continue;
    out.push(interval);
  }
  return out;
}

// ─── Defaults ──────────────────────────────────────────────────────

function getDefaultProfile(source: BehaviorProfileSource = 'default', samples = 0): BehavioralProfile {
  return {
    typingSpeed: { meanWpm: 60, variance: 15 },
    mouseMovement: { curveBias: 'ease-in-out', averageSpeedPxPerMs: 1.2 },
    source,
    samples,
    lastCompiledAt: Date.now(),
  };
}

// ─── Manager ───────────────────────────────────────────────────────

export class BehaviorCompiler {
  private readonly rawDir: string;
  private readonly profilePath: string;

  constructor() {
    this.rawDir = tandemDir('behavior', 'raw');
    this.profilePath = tandemDir('behavior', 'profile.json');
  }

  /**
   * Read every ~/.tandem/behavior/raw/ *.jsonl file, extract keypress
   * intervals, filter+trim, compute stats, persist and return the
   * compiled profile. Safe to call repeatedly — idempotent within a
   * single snapshot of raw data.
   */
  compile(): BehavioralProfile {
    const intervals = this.collectIntervals();
    const filtered = filterOutliers(intervals);
    const sorted = filtered.slice().sort((a, b) => a - b);
    const trimmed = percentileTrim(sorted);

    if (trimmed.length < SAMPLE_FLOOR) {
      const source: BehaviorProfileSource = trimmed.length === 0 ? 'default' : 'default-insufficient';
      return this.persist(getDefaultProfile(source, trimmed.length));
    }

    const stats = computeStatsFromIntervals(trimmed);
    if (stats.meanWpm < SANE_WPM_MIN || stats.meanWpm > SANE_WPM_MAX) {
      return this.persist(getDefaultProfile('default-insufficient', trimmed.length));
    }

    const profile: BehavioralProfile = {
      typingSpeed: {
        meanWpm: stats.meanWpm,
        variance: stats.variance,
      },
      mouseMovement: {
        // Mouse profile is still on defaults — real curves need webview-side
        // move events (phase 2). See design doc in docs/superpowers/.
        curveBias: 'ease-in-out',
        averageSpeedPxPerMs: 1.2,
      },
      source: 'compiled',
      samples: stats.samples,
      lastCompiledAt: Date.now(),
    };
    return this.persist(profile);
  }

  /**
   * Return the currently-persisted profile, or compile a fresh one if
   * the profile file is missing or unreadable.
   */
  getProfile(): BehavioralProfile {
    if (fs.existsSync(this.profilePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.profilePath, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          return parsed as BehavioralProfile;
        }
      } catch {
        // fall through to compile
      }
    }
    return this.compile();
  }

  // ─── private ─────────────────────────────────────────────────────

  private collectIntervals(): number[] {
    if (!fs.existsSync(this.rawDir)) return [];
    let names: string[];
    try {
      names = fs.readdirSync(this.rawDir);
    } catch {
      return [];
    }
    const jsonl = names.filter((n) => n.endsWith('.jsonl'));
    const all: number[] = [];
    for (const name of jsonl) {
      const full = path.join(this.rawDir, name);
      let content: string;
      try {
        content = fs.readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      for (const v of extractIntervalsFromJsonl(content)) {
        all.push(v);
      }
    }
    return all;
  }

  private persist(profile: BehavioralProfile): BehavioralProfile {
    try {
      const dir = path.dirname(this.profilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.profilePath, JSON.stringify(profile, null, 2));
      try { fs.chmodSync(this.profilePath, 0o600); } catch { /* best effort */ }
    } catch {
      // Writes can fail on read-only FS; still return the computed profile.
    }
    return profile;
  }
}

export const behaviorCompiler = new BehaviorCompiler();
