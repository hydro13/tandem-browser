// src/config/io.ts
// Sync file reader for the persisted config. Used during main-process startup
// BEFORE ConfigManager is initialized (e.g. to resolve the pre-paint theme
// for webPreferences.additionalArguments).

import fs from 'fs';
import path from 'path';
import { tandemDir } from '../utils/paths';

/**
 * Shape we care about during pre-window startup. The full config type is
 * larger (see `src/config/manager.ts`); we only type the fields we read here.
 */
export interface PreStartupConfig {
  appearance?: {
    theme?: 'dark' | 'light' | 'system';
  };
}

/**
 * Read ~/.tandem/config.json synchronously. Returns `null` if the file
 * is missing or unreadable (e.g. first launch). Never throws.
 */
export function readConfigFileSync(): PreStartupConfig | null {
  try {
    const p = path.join(tandemDir(), 'config.json');
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as PreStartupConfig;
    return null;
  } catch {
    return null;
  }
}
