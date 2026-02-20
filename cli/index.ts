#!/usr/bin/env node
import { Command } from 'commander';
import { registerOpen } from './commands/open';
import { registerSnapshot } from './commands/snapshot';
import { registerClick } from './commands/click';
import { registerFill } from './commands/fill';
import { registerEval } from './commands/eval';
import { registerScreenshot } from './commands/screenshot';
import { registerCookies } from './commands/cookies';
import { registerSession } from './commands/session';

const program = new Command();

program
  .name('tandem')
  .description('CLI for Tandem Browser API')
  .version('0.1.0')
  .option('--session <name>', 'Use a named browser session (X-Session header)');

registerOpen(program);
registerSnapshot(program);
registerClick(program);
registerFill(program);
registerEval(program);
registerScreenshot(program);
registerCookies(program);
registerSession(program);

program.parse();
