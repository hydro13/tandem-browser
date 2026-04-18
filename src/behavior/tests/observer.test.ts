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
