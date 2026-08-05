import * as vscode from 'vscode';
import { insertConsoleLog } from './commands/insertConsoleLog';
import { toggleAllConsoleLogs } from './commands/toggleAllConsoleLogs';
import { toggleConsoleLog } from './commands/toggleConsoleLog';

/**
 * 插件只注册命令, 没有监听器, 计时器, 状态项或后台任务,
 * 因此不需要 deactivate 做清理.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('editorConsoleToolkit.insertConsoleLog', insertConsoleLog),
    vscode.commands.registerCommand('editorConsoleToolkit.toggleConsoleLog', toggleConsoleLog),
    vscode.commands.registerCommand('editorConsoleToolkit.toggleAllConsoleLogs', toggleAllConsoleLogs)
  );
}
