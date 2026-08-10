import * as vscode from 'vscode';

import {
  killProcesses,
  realSendSignal,
  realWait,
  summarizeOutcomes,
  type KillTarget,
} from './kill';
import { runCommand } from './scan/exec';
import type { PortItem } from './view/item';
import type { CheckedTarget, PortsView } from './view/provider';

/**
 * 端口相关命令的注册与交互。
 *
 * 终止是不可逆操作, 所以每条路径都先列出将被终止的进程再二次确认; 结果按逐项成败汇总,
 * 被跳过的项明确说明原因 —— "勾了 3 个只杀了 2 个"必须让人看得见。
 *
 * 搜索用 `createInputBox` 而不是 `showInputBox`: 只有前者能拿到 `onDidChangeValue`, 而边输边
 * 过滤需要它。代价是取消语义要自己实现 —— Esc 时把实时过滤退回打开输入框之前的搜索词。
 */

const CONFIG_SECTION = 'editorConsoleToolkit.ports';

/** 输入停顿多久才重算过滤; 过滤是纯内存计算, 防抖只为避免每个字符都重建整棵树。 */
const SEARCH_DEBOUNCE = 200;

function killTimeout(): number {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('killTimeout', 3000);
}

function describe(targets: CheckedTarget[]): string {
  return targets.map((target) => `${target.name} (${target.pid})`).join(', ');
}

/** 源字符串即 l10n 的 lookup key, 因此不能拼接; 变量一律走 `{0}` 占位。 */
async function confirm(targets: CheckedTarget[]): Promise<boolean> {
  const question =
    targets.length === 1
      ? vscode.l10n.t('Terminate {0}?', describe(targets))
      : vscode.l10n.t('Terminate these {0} processes? {1}', targets.length, describe(targets));

  const answer = await vscode.window.showWarningMessage(
    question,
    { modal: true },
    vscode.l10n.t('Terminate')
  );
  return answer !== undefined;
}

async function runKill(targets: CheckedTarget[], view: PortsView): Promise<void> {
  if (targets.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No process is checked.'));
    return;
  }
  if (!(await confirm(targets))) return;

  const killTargets: KillTarget[] = targets.map((target) => ({
    pid: target.pid,
    expectedCommand: target.expectedCommand,
    name: target.name,
  }));

  const reports = await killProcesses(killTargets, {
    run: runCommand,
    sendSignal: realSendSignal,
    wait: realWait,
    platform: process.platform,
    killTimeout: killTimeout(),
  });

  const summary = summarizeOutcomes(reports);
  const done = summary.terminated + summary.killed;

  if (summary.problems.length === 0) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Terminated {0} of {1} processes.', done, reports.length)
    );
  } else {
    const details = summary.problems
      .map((report) =>
        report.outcome === 'skipped-changed'
          ? vscode.l10n.t('{0} changed since you checked it, skipped.', report.target.name)
          : vscode.l10n.t('{0} could not be terminated.', report.target.name)
      )
      .join(' ');
    void vscode.window.showWarningMessage(
      vscode.l10n.t('Terminated {0} of {1} processes. {2}', done, reports.length, details)
    );
  }

  view.clearChecked();
  view.refresh();
}

export function registerPortCommands(context: vscode.ExtensionContext, view: PortsView): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('editorConsoleToolkit.ports.refresh', () => {
      view.refresh();
    }),

    vscode.commands.registerCommand('editorConsoleToolkit.ports.killSelected', () =>
      runKill(view.getCheckedTargets(), view)
    ),

    vscode.commands.registerCommand('editorConsoleToolkit.ports.killOne', (item?: PortItem) => {
      const entry = item?.entry;
      if (!entry || entry.pid === null || !entry.killable) {
        void vscode.window.showWarningMessage(vscode.l10n.t('This process cannot be terminated.'));
        return undefined;
      }
      return runKill(
        [{ pid: entry.pid, expectedCommand: entry.command, name: entry.name }],
        view
      );
    }),

    vscode.commands.registerCommand(
      'editorConsoleToolkit.ports.toggleSystemProcesses',
      async () => {
        // 写进配置而不是只改内存态: 这样设置界面看得见, 且重载窗口后仍然保持。
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        const hidden = config.get<boolean>('hideSystemProcesses', true);
        await config.update('hideSystemProcesses', !hidden, vscode.ConfigurationTarget.Global);
      }
    ),

    vscode.commands.registerCommand('editorConsoleToolkit.ports.search', () => {
      const original = view.getSearch();
      const input = vscode.window.createInputBox();
      input.value = original;
      input.prompt = vscode.l10n.t(
        'Filter by process name, command, PID, working directory or port'
      );
      input.placeholder = vscode.l10n.t('for example 3000, node, ~/repo');

      let accepted = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stopTimer = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      };

      input.onDidChangeValue((value) => {
        stopTimer();
        timer = setTimeout(() => {
          timer = undefined;
          view.setSearch(value);
        }, SEARCH_DEBOUNCE);
      });

      input.onDidAccept(() => {
        accepted = true;
        stopTimer();
        view.setSearch(input.value);
        input.hide();
      });

      input.onDidHide(() => {
        stopTimer();
        // 没走 accept 就是按了 Esc: 撤掉实时过滤已经应用的内容。
        if (!accepted) view.setSearch(original);
        input.dispose();
      });

      input.show();
    }),

    // 从搜索行的 inline 按钮调用时会带一个 TreeItem 实参, 这里不需要它。
    vscode.commands.registerCommand('editorConsoleToolkit.ports.clearSearch', () => {
      view.setSearch('');
    })
  );
}
