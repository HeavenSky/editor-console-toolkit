import { runConsoleLogCommand } from './runner';

export function toggleAllConsoleLogs(): Promise<void> {
  return runConsoleLogCommand('toggle-all');
}
