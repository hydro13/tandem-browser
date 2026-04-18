import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      createWriteStream: vi.fn(() => ({
        write: vi.fn(),
        end: vi.fn(),
      })),
      readdirSync: vi.fn().mockReturnValue([]),
      readFileSync: vi.fn().mockReturnValue(''),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
    })),
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn().mockReturnValue(''),
  };
});

vi.mock('../../utils/paths', () => ({
  tandemDir: vi.fn((...parts: string[]) => ['/tmp/tandem-test', ...parts].join('/')),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import fs from 'fs';
import { BehaviorObserver } from '../observer';

interface MockWebContents extends EventEmitter {
  on: EventEmitter['on'];
}

function makeMockWindow(): { webContents: MockWebContents } {
  const wc = new EventEmitter() as MockWebContents;
  return { webContents: wc };
}

function extractWrittenKeypressIntervals(): number[] {
  // The observer writes JSONL to a stream. Our mocked createWriteStream
  // returns a fresh mock per instance; pull its write calls.
  const streamCalls = vi.mocked(fs.createWriteStream).mock.results;
  const intervals: number[] = [];
  for (const r of streamCalls) {
    if (r.type !== 'return') continue;
    const stream = r.value as { write: ReturnType<typeof vi.fn> };
    for (const [line] of stream.write.mock.calls) {
      const text = String(line).trim();
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'keypress' && typeof parsed.data?.interval === 'number') {
          intervals.push(parsed.data.interval);
        }
      } catch { /* ignore malformed */ }
    }
  }
  return intervals;
}

describe('BehaviorObserver — keypress interval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('records 0 for the first keypress (no previous timestamp), then real deltas after', () => {
    const win = makeMockWindow();
    const observer = new BehaviorObserver(win as any);

    const now = Date.now();
    win.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'a' });
    // Nudge Date.now forward for the second event. We stub to control timing.
    const originalNow = Date.now;
    Date.now = () => now + 120;
    try {
      win.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'b' });
    } finally {
      Date.now = originalNow;
    }

    const intervals = extractWrittenKeypressIntervals();
    // First keypress: no previous → 0. Second: delta from first.
    expect(intervals.length).toBe(2);
    expect(intervals[0]).toBe(0);
    expect(intervals[1]).toBeGreaterThan(0); // not the zero bug
    // Keep the session in a happy state
    observer.destroy();
  });

  it('populates the in-memory keypressIntervals array via getStats', () => {
    const win = makeMockWindow();
    const observer = new BehaviorObserver(win as any);

    const originalNow = Date.now;
    try {
      let t = 1_000_000;
      Date.now = () => t;
      win.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'a' });
      t += 150;
      win.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'b' });
      t += 180;
      win.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'c' });
    } finally {
      Date.now = originalNow;
    }

    const stats = observer.getStats() as Record<string, unknown>;
    // Two intervals recorded (from the two deltas).
    expect(stats.keypressSamples).toBe(2);
    expect(stats.avgKeypressIntervalMs).toBe(Math.round((150 + 180) / 2));
    observer.destroy();
  });
});

describe('BehaviorObserver.recordWebviewKeypress — privacy floor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('persists keypress events that contain ONLY {type, ts, data.interval} — no keys, no site, no tab metadata', () => {
    const win = makeMockWindow();
    const observer = new BehaviorObserver(win as any);

    observer.recordWebviewKeypress(150);
    observer.recordWebviewKeypress(180);

    const lines = extractWrittenKeypressLines();
    expect(lines.length).toBe(2);
    for (const parsed of lines) {
      // The only allowed fields at the top level:
      expect(Object.keys(parsed).sort()).toEqual(['data', 'ts', 'type']);
      expect(parsed.type).toBe('keypress');
      expect(typeof parsed.ts).toBe('number');
      // And data may only carry "interval":
      expect(Object.keys(parsed.data).sort()).toEqual(['interval']);
      expect(typeof parsed.data.interval).toBe('number');
    }
    observer.destroy();
  });

  it('rejects non-positive intervals (no persisted event at all)', () => {
    const win = makeMockWindow();
    const observer = new BehaviorObserver(win as any);

    observer.recordWebviewKeypress(0);
    observer.recordWebviewKeypress(-5);
    observer.recordWebviewKeypress(NaN);

    expect(extractWrittenKeypressLines().length).toBe(0);
    observer.destroy();
  });

  it('rejects intervals >= 5000ms as cross-session pauses (no persisted event)', () => {
    const win = makeMockWindow();
    const observer = new BehaviorObserver(win as any);

    observer.recordWebviewKeypress(4999); // accepted
    observer.recordWebviewKeypress(5000); // rejected
    observer.recordWebviewKeypress(6000); // rejected

    const lines = extractWrittenKeypressLines();
    expect(lines.length).toBe(1);
    expect(lines[0].data.interval).toBe(4999);
    observer.destroy();
  });

  it('feeds recorded intervals into the same keypressIntervals stats as shell keypresses', () => {
    const win = makeMockWindow();
    const observer = new BehaviorObserver(win as any);

    observer.recordWebviewKeypress(150);
    observer.recordWebviewKeypress(180);
    observer.recordWebviewKeypress(210);

    const stats = observer.getStats() as Record<string, unknown>;
    expect(stats.keypressSamples).toBe(3);
    expect(stats.avgKeypressIntervalMs).toBe(Math.round((150 + 180 + 210) / 3));
    observer.destroy();
  });
});

/** Parse every keypress line written by the mocked file stream. */
function extractWrittenKeypressLines(): Array<{ type: string; ts: number; data: { interval: number } }> {
  const streamCalls = vi.mocked(fs.createWriteStream).mock.results;
  const out: Array<{ type: string; ts: number; data: { interval: number } }> = [];
  for (const r of streamCalls) {
    if (r.type !== 'return') continue;
    const stream = r.value as { write: ReturnType<typeof vi.fn> };
    for (const [line] of stream.write.mock.calls) {
      const text = String(line).trim();
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'keypress') out.push(parsed);
      } catch { /* ignore */ }
    }
  }
  return out;
}
