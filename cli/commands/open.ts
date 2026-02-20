import { Command } from 'commander';
import { api } from '../client';

export function registerOpen(program: Command): void {
  program
    .command('open <url>')
    .description('Navigate to a URL')
    .action(async (url: string) => {
      const session = program.opts().session as string | undefined;
      const result = await api('POST', '/navigate', { url }, session);
      console.log(JSON.stringify(result, null, 2));
    });
}
