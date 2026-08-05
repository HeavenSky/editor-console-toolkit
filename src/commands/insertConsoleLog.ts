import { runConsoleLogCommand } from './runner';

export function insertConsoleLog(): Promise<void> {
  return runConsoleLogCommand('insert');
}
