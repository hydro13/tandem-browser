import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/** Return absolute path under ~/.tandem/, e.g. tandemDir('extensions') → ~/.tandem/extensions */
export function tandemDir(...subpath: string[]): string {
  return path.join(os.homedir(), '.tandem', ...subpath);
}

/** Create directory if it doesn't exist (sync). Returns the path. */
export function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
