import { Command } from 'commander';
import { api } from '../client';

export function registerEval(program: Command): void {
  program
    .command('eval <javascript>')
    .description('Execute JavaScript in the active tab')
    .action(async (javascript: string) => {
      const session = program.opts().session as string | undefined;
      const result = await api('POST', '/execute-js', { code: javascript }, session) as { result?: unknown };
      if (result.result !== undefined) {
        console.log(typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });
}
