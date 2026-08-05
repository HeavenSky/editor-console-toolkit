import * as vscode from 'vscode';
import { insertConsoleLog } from './commands/insertConsoleLog';
import { toggleConsoleLog } from './commands/toggleConsoleLog';

/**
 * 插件只注册两条命令, 没有监听器, 计时器, 状态项或后台任务,
 * 因此不需要 deactivate 做清理.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('editorConsoleToolkit.insertConsoleLog', insertConsoleLog),
    vscode.commands.registerCommand('editorConsoleToolkit.toggleConsoleLog', toggleConsoleLog)
  );
}
