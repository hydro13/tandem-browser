import { Command } from 'commander';
import { api } from '../client';

export function registerSnapshot(program: Command): void {
  program
    .command('snapshot')
    .description('Get accessibility tree snapshot')
    .option('-i, --interactive', 'Only interactive elements (buttons, inputs, links)')
    .option('-c, --compact', 'Remove empty structural nodes')
    .option('-s, --selector <selector>', 'Scope to CSS selector')
    .option('-d, --depth <number>', 'Max tree depth')
    .action(async (opts: { interactive?: boolean; compact?: boolean; selector?: string; depth?: string }) => {
      const session = program.opts().session as string | undefined;
      const params = new URLSearchParams();
      if (opts.interactive) params.set('interactive', 'true');
      if (opts.compact) params.set('compact', 'true');
      if (opts.selector) params.set('selector', opts.selector);
      if (opts.depth) params.set('depth', opts.depth);

      const qs = params.toString();
      const endpoint = qs ? `/snapshot?${qs}` : '/snapshot';
      const result = await api('GET', endpoint, undefined, session) as { snapshot?: string };
      if (result.snapshot) {
        console.log(result.snapshot);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });
}
