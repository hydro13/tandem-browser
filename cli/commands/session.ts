import { Command } from 'commander';
import { api } from '../client';

export function registerSession(program: Command): void {
  const cmd = program
    .command('session')
    .description('Manage browser sessions');

  cmd
    .command('list')
    .description('List all sessions')
    .action(async () => {
      const session = program.opts().session as string | undefined;
      const result = await api('GET', '/sessions/list', undefined, session);
      console.log(JSON.stringify(result, null, 2));
    });

  cmd
    .command('create <name>')
    .description('Create a new session')
    .action(async (name: string) => {
      const session = program.opts().session as string | undefined;
      const result = await api('POST', '/sessions/create', { name }, session);
      console.log(JSON.stringify(result, null, 2));
    });

  cmd
    .command('switch <name>')
    .description('Switch to a session')
    .action(async (name: string) => {
      const session = program.opts().session as string | undefined;
      const result = await api('POST', '/sessions/switch', { name }, session);
      console.log(JSON.stringify(result, null, 2));
    });

  cmd
    .command('destroy <name>')
    .description('Destroy a session')
    .action(async (name: string) => {
      const session = program.opts().session as string | undefined;
      const result = await api('POST', '/sessions/destroy', { name }, session);
      console.log(JSON.stringify(result, null, 2));
    });
}
