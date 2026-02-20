import { Command } from 'commander';
import { api } from '../client';

export function registerFill(program: Command): void {
  program
    .command('fill <target> <text>')
    .description('Fill text into an element by @ref or CSS selector')
    .action(async (target: string, text: string) => {
      const session = program.opts().session as string | undefined;
      if (target.startsWith('@')) {
        const result = await api('POST', '/snapshot/fill', { ref: target, value: text }, session);
        console.log(JSON.stringify(result, null, 2));
      } else {
        const result = await api('POST', '/type', { selector: target, text }, session);
        console.log(JSON.stringify(result, null, 2));
      }
    });
}
