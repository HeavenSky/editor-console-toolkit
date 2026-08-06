import * as vscode from 'vscode';
import { insertConsoleLog } from './commands/insertConsoleLog';
import { toggleAllConsoleLogs } from './commands/toggleAllConsoleLogs';
import { toggleConsoleLog } from './commands/toggleConsoleLog';
import { registerPortCommands } from './ports/commands';
import { createPortsView } from './ports/view/provider';

/**
 * 两个功能域的接线。
 *
 * console 命令仍然是纯命令式的: 没有监听器, 没有计时器, 没有状态项。
 * ports 视图则相反 —— 它是常驻 TreeView 并在可见时轮询刷新, 但计时器, 勾选态与视图本身
 * 都挂在 `context.subscriptions` 上由宿主统一释放, 因此不需要单独的 `deactivate`。
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('editorConsoleToolkit.insertConsoleLog', insertConsoleLog),
    vscode.commands.registerCommand('editorConsoleToolkit.toggleConsoleLog', toggleConsoleLog),
    vscode.commands.registerCommand('editorConsoleToolkit.toggleAllConsoleLogs', toggleAllConsoleLogs)
  );

  const portsView = createPortsView(context);
  context.subscriptions.push(portsView);
  registerPortCommands(context, portsView);
}
