import type { WebContents } from 'electron';
import { createLogger } from '../utils/logger';

const log = createLogger('ScriptInjector');

// ─── Types ──────────────────────────────────────────────────────────

export interface RegisteredScript {
  name: string;
  code: string;
  enabled: boolean;
  addedAt: number;
}

export interface RegisteredStyle {
  name: string;
  css: string;
  enabled: boolean;
  addedAt: number;
}

// ─── Manager ────────────────────────────────────────────────────────

/**
 * ScriptInjector — manages user scripts and styles injected into webview tabs.
 */
export class ScriptInjector {

  // === 1. Private state ===

  private scripts = new Map<string, RegisteredScript>();
  private styles = new Map<string, RegisteredStyle>();

  // === 4. Public methods ===

  // --- Scripts ---

  addScript(name: string, code: string): RegisteredScript {
    const entry: RegisteredScript = {
      name,
      code,
      enabled: true,
      addedAt: Date.now(),
    };
    this.scripts.set(name, entry);
    return entry;
  }

  removeScript(name: string): boolean {
    return this.scripts.delete(name);
  }

  enableScript(name: string): boolean {
    const s = this.scripts.get(name);
    if (!s) return false;
    s.enabled = true;
    return true;
  }

  disableScript(name: string): boolean {
    const s = this.scripts.get(name);
    if (!s) return false;
    s.enabled = false;
    return true;
  }

  listScripts(): RegisteredScript[] {
    return Array.from(this.scripts.values());
  }

  // --- Styles ---

  addStyle(name: string, css: string): RegisteredStyle {
    const entry: RegisteredStyle = {
      name,
      css,
      enabled: true,
      addedAt: Date.now(),
    };
    this.styles.set(name, entry);
    return entry;
  }

  removeStyle(name: string): boolean {
    return this.styles.delete(name);
  }

  enableStyle(name: string): boolean {
    const s = this.styles.get(name);
    if (!s) return false;
    s.enabled = true;
    return true;
  }

  disableStyle(name: string): boolean {
    const s = this.styles.get(name);
    if (!s) return false;
    s.enabled = false;
    return true;
  }

  listStyles(): RegisteredStyle[] {
    return Array.from(this.styles.values());
  }

  // --- Injection ---

  /**
   * Called after every did-finish-load.
   * Re-injects all enabled scripts and styles into the given WebContents.
   */
  async reloadIntoTab(wc: WebContents): Promise<void> {
    // Scripts
    for (const script of this.scripts.values()) {
      if (!script.enabled) continue;
      try {
        await wc.executeJavaScript(script.code);
      } catch (e) {
        log.warn(`Script "${script.name}" failed:`, e instanceof Error ? e.message : String(e));
      }
    }

    // Styles — insertCSS returns a key, but we don't need to track it
    // (on next navigation, the old CSS is gone anyway; we re-inject fresh)
    for (const style of this.styles.values()) {
      if (!style.enabled) continue;
      try {
        await wc.insertCSS(style.css);
      } catch (e) {
        log.warn(`Style "${style.name}" failed:`, e instanceof Error ? e.message : String(e));
      }
    }
  }
}
