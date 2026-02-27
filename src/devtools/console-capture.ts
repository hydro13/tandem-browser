import type { WebContents } from 'electron';
import type { ConsoleEntry, CDPConsoleAPICalledParams, CDPExceptionThrownParams, CDPRemoteObject, CDPCallFrame } from './types';

const MAX_CONSOLE_ENTRIES = 500;
const MAX_ARG_LENGTH = 1000;
const MAX_STACK_LENGTH = 2000;

/**
 * ConsoleCapture — Buffers console output from a webContents via CDP.
 *
 * Attaches to CDP Runtime domain, captures consoleAPICalled and
 * exceptionThrown events. Maintains a ring buffer of entries.
 *
 * IMPORTANT: This class does NOT own the debugger attachment.
 * DevToolsManager handles attach/detach lifecycle.
 * ConsoleCapture only subscribes to events on an already-attached debugger.
 */
export class ConsoleCapture {
  private entries: ConsoleEntry[] = [];
  private counter = 0;
  private enabled = false;

  /**
   * Start capturing console output from the given webContents.
   * PRECONDITION: webContents.debugger must already be attached.
   */
  async enable(wc: WebContents, _tabId?: string): Promise<void> {
    if (this.enabled) return;

    // Enable Runtime domain for console events
    await wc.debugger.sendCommand('Runtime.enable');
    this.enabled = true;
  }

  /**
   * Handle a CDP event. Called by DevToolsManager's message router.
   * Returns true if this capture handled the event.
   */
  handleEvent(method: string, params: Record<string, unknown>, tabId?: string): boolean {
    if (method === 'Runtime.consoleAPICalled') {
      this.onConsoleAPI(params as unknown as CDPConsoleAPICalledParams, tabId);
      return true;
    }
    if (method === 'Runtime.exceptionThrown') {
      this.onException(params as unknown as CDPExceptionThrownParams, tabId);
      return true;
    }
    return false;
  }

  private onConsoleAPI(params: CDPConsoleAPICalledParams, tabId?: string): void {
    const levelMap: Record<string, ConsoleEntry['level']> = {
      log: 'log', info: 'info', warning: 'warn', error: 'error',
      debug: 'debug', dir: 'log', dirxml: 'log', table: 'log',
      trace: 'debug', assert: 'error',
    };

    const args = (params.args || []).map((arg: CDPRemoteObject) => {
      if (arg.type === 'string') return String(arg.value ?? '');
      if (arg.type === 'number' || arg.type === 'boolean') return String(arg.value);
      if (arg.type === 'undefined') return 'undefined';
      if (arg.subtype === 'null') return 'null';
      if (arg.type === 'object') {
        // Use preview if available, else description
        if (arg.preview?.properties) {
          const props = arg.preview.properties
            .map((p) => `${p.name}: ${p.value}`)
            .join(', ');
          return `{${props}}${arg.preview.overflow ? ', ...' : ''}`;
        }
        return arg.description || arg.className || '[object]';
      }
      if (arg.type === 'function') return arg.description?.substring(0, 100) || '[function]';
      return arg.description || String(arg.value ?? arg.type);
    }).map((s) => s.length > MAX_ARG_LENGTH ? s.substring(0, MAX_ARG_LENGTH) + '...' : s);

    const text = args.join(' ');
    const stackTrace = params.stackTrace?.callFrames?.length
      ? params.stackTrace.callFrames
          .slice(0, 5)
          .map((f: CDPCallFrame) => `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
          .join('\n')
      : undefined;

    const topFrame = params.stackTrace?.callFrames?.[0];

    this.addEntry({
      id: ++this.counter,
      level: levelMap[params.type] || 'log',
      text,
      args,
      url: topFrame?.url || '',
      line: topFrame?.lineNumber ?? 0,
      column: topFrame?.columnNumber ?? 0,
      timestamp: Date.now(),
      tabId,
      stackTrace: stackTrace?.substring(0, MAX_STACK_LENGTH),
    });
  }

  private onException(params: CDPExceptionThrownParams, tabId?: string): void {
    const ex = params.exceptionDetails;
    if (!ex) return;

    let text = ex.text || 'Uncaught exception';
    if (ex.exception?.description) {
      text = ex.exception.description;
    }

    const stackTrace = ex.stackTrace?.callFrames?.length
      ? ex.stackTrace.callFrames
          .slice(0, 10)
          .map((f: CDPCallFrame) => `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
          .join('\n')
      : undefined;

    this.addEntry({
      id: ++this.counter,
      level: 'error',
      text: text.length > MAX_ARG_LENGTH ? text.substring(0, MAX_ARG_LENGTH) + '...' : text,
      args: [text],
      url: ex.url || '',
      line: ex.lineNumber ?? 0,
      column: ex.columnNumber ?? 0,
      timestamp: Date.now(),
      tabId,
      stackTrace: stackTrace?.substring(0, MAX_STACK_LENGTH),
    });
  }

  private addEntry(entry: ConsoleEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_CONSOLE_ENTRIES) {
      this.entries = this.entries.slice(-MAX_CONSOLE_ENTRIES);
    }
  }

  /** Get entries, optionally filtered by level and/or since an ID */
  getEntries(opts?: { level?: string; sinceId?: number; limit?: number; search?: string }): ConsoleEntry[] {
    let result = this.entries;
    if (opts?.sinceId) result = result.filter(e => e.id > opts.sinceId!);
    if (opts?.level) result = result.filter(e => e.level === opts.level);
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      result = result.filter(e => e.text.toLowerCase().includes(q));
    }
    const limit = opts?.limit ?? 100;
    return result.slice(-limit);
  }

  /** Get only errors (convenience) */
  getErrors(limit = 50): ConsoleEntry[] {
    return this.getEntries({ level: 'error', limit });
  }

  /** Get entry count by level */
  getCounts(): Record<string, number> {
    const counts: Record<string, number> = { log: 0, info: 0, warn: 0, error: 0, debug: 0 };
    for (const e of this.entries) {
      counts[e.level] = (counts[e.level] || 0) + 1;
    }
    return counts;
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
  }

  /** Reset state on tab switch / detach */
  reset(): void {
    this.enabled = false;
    // Don't clear entries — they may still be useful
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get entryCount(): number {
    return this.entries.length;
  }

  get lastEntryId(): number {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1].id : 0;
  }
}
