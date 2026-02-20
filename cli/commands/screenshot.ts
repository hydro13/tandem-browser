import fs from 'fs';
import os from 'os';
import path from 'path';
import { Command } from 'commander';
import { api, apiRaw } from '../client';

export function registerScreenshot(program: Command): void {
  program
    .command('screenshot [path]')
    .description('Take a screenshot of the active tab')
    .action(async (savePath?: string) => {
      const session = program.opts().session as string | undefined;

      if (savePath) {
        const absPath = path.resolve(savePath);
        const result = await api('GET', `/screenshot?save=${encodeURIComponent(absPath)}`, undefined, session);
        console.log(JSON.stringify(result, null, 2));
      } else {
        const png = await apiRaw('GET', '/screenshot', session);
        const tmpPath = path.join(os.tmpdir(), `tandem-screenshot-${Date.now()}.png`);
        fs.writeFileSync(tmpPath, png);
        console.log(tmpPath);
      }
    });
}
