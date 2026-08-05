import { runConsoleLogCommand } from './runner';

export function toggleConsoleLog(): Promise<void> {
  return runConsoleLogCommand('toggle');
}
