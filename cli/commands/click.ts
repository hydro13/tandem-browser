import { Command } from 'commander';
import { api } from '../client';

export function registerClick(program: Command): void {
  program
    .command('click <target>')
    .description('Click an element by @ref or CSS selector')
    .action(async (target: string) => {
      const session = program.opts().session as string | undefined;
      if (target.startsWith('@')) {
        const result = await api('POST', '/snapshot/click', { ref: target }, session);
        console.log(JSON.stringify(result, null, 2));
      } else {
        const result = await api('POST', '/click', { selector: target }, session);
        console.log(JSON.stringify(result, null, 2));
      }
    });
}
