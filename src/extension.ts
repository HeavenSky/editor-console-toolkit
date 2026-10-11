import * as vscode from 'vscode';
import { registerChecksumCommands } from './checksums/commands';
import { insertConsoleLog } from './commands/insertConsoleLog';
import { toggleAllConsoleLogs } from './commands/toggleAllConsoleLogs';
import { toggleConsoleLog } from './commands/toggleConsoleLog';
import { registerPortCommands } from './ports/commands';
import { createPortsView } from './ports/view/provider';
import { registerThemeRotation } from './themes/commands';

/**
 * 四个功能域的接线。
 *
 * console 与 checksums 命令都是纯命令式的: 没有监听器, 没有计时器, 没有状态项, 也不在激活
 * 时读盘 —— checksums 只在用户执行命令时才碰编辑器安装目录。
 * ports 视图则相反 —— 它是常驻 TreeView 并在可见时轮询刷新; themes 轮换在启动时激活, 只在
 * 前台窗口挂一个定时器。两者的计时器, 监听器与视图都挂在 `context.subscriptions` 上由宿主
 * 统一释放, 因此不需要单独的 `deactivate`。
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

  registerChecksumCommands(context);

  registerThemeRotation(context);
}
