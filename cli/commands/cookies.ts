import { Command } from 'commander';
import { api } from '../client';

export function registerCookies(program: Command): void {
  const cmd = program
    .command('cookies')
    .description('Get or set cookies');

  cmd
    .command('list', { isDefault: true })
    .description('List all cookies')
    .action(async () => {
      const session = program.opts().session as string | undefined;
      const result = await api('GET', '/cookies', undefined, session);
      console.log(JSON.stringify(result, null, 2));
    });

  cmd
    .command('set <name> <value>')
    .description('Set a cookie')
    .action(async (name: string, value: string) => {
      const session = program.opts().session as string | undefined;
      const result = await api('POST', '/cookies/set', { name, value }, session);
      console.log(JSON.stringify(result, null, 2));
    });
}
