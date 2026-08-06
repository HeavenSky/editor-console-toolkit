import * as vscode from 'vscode';

import { shortenPath } from '../filter';
import type { Listener, ProcessEntry } from '../types';

/**
 * 视图项构造。
 *
 * 根节点是**进程**而不是端口: 终止的单位本来就是进程, 以进程为根才能让"勾了几行"与
 * "杀了几个进程"永远一致。端口聚合到该行的 description 里。
 */

/** `contextValue` 决定右键菜单; 只有 `portProcess` 会拿到终止项。 */
export const CONTEXT_PROCESS = 'portProcess';
export const CONTEXT_PROTECTED = 'portProtected';
export const CONTEXT_DETAIL = 'portDetail';

export interface PortItem extends vscode.TreeItem {
  /** 详情子节点与错误项没有 entry。 */
  readonly entry?: ProcessEntry;
}

const formatListener = (listener: Listener): string =>
  `${listener.protocol} ${listener.address}:${listener.port}`;

/** 不可终止的原因转成一句可读说明; 源串即 l10n 的 lookup key, 所以必须是字面量。 */
function blockedLabel(entry: ProcessEntry): string | undefined {
  switch (entry.blockedReason) {
    case 'protected-ancestor':
      return vscode.l10n.t('the editor itself');
    case 'other-user':
      return vscode.l10n.t('another user, needs elevation');
    case 'unknown-pid':
      return vscode.l10n.t('owner unknown');
    default:
      return undefined;
  }
}

function tooltipFor(entry: ProcessEntry, home: string): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  const unknown = vscode.l10n.t('unknown');

  tooltip.appendMarkdown(`**${entry.name || unknown}**\n\n`);
  tooltip.appendMarkdown(`PID: \`${entry.pid ?? unknown}\`  ·  PPID: \`${entry.ppid ?? unknown}\`\n\n`);
  tooltip.appendMarkdown(`${vscode.l10n.t('User')}: ${entry.user || unknown}\n\n`);
  tooltip.appendMarkdown(`${vscode.l10n.t('Uptime')}: ${entry.etime || unknown}\n\n`);
  tooltip.appendMarkdown(
    `${vscode.l10n.t('Working directory')}: ${entry.cwd ? shortenPath(entry.cwd, home) : unknown}\n\n`
  );
  tooltip.appendMarkdown(`${vscode.l10n.t('Listening on')}: ${entry.listeners.map(formatListener).join(' · ')}\n\n`);
  if (entry.command) tooltip.appendMarkdown(`${vscode.l10n.t('Command')}:\n\n\`${entry.command}\`\n`);

  const blocked = blockedLabel(entry);
  if (blocked) tooltip.appendMarkdown(`\n---\n${vscode.l10n.t('Cannot be terminated:')} ${blocked}\n`);

  return tooltip;
}

/**
 * 根节点。
 *
 * `checkboxState` 只在可终止时设置 —— 不设置该属性的项在 UI 上根本没有勾选框, 这比
 * "有框但点了没反应"更明确。`checked` 由 provider 在重扫后回填, 因为刷新会重建全部 TreeItem。
 */
export function createProcessItem(
  entry: ProcessEntry,
  options: { home: string; checked: boolean }
): PortItem {
  const item = new vscode.TreeItem(
    entry.name || vscode.l10n.t('unknown'),
    vscode.TreeItemCollapsibleState.Collapsed
  ) as vscode.TreeItem & { entry?: ProcessEntry };

  const ports = entry.listeners.map((listener) => listener.port).join(', ');
  const marks: string[] = [ports];
  if (entry.origin === 'workspace') marks.push(vscode.l10n.t('this workspace'));
  const blocked = blockedLabel(entry);
  if (blocked) marks.push(blocked);
  item.description = marks.join('  ·  ');

  item.tooltip = tooltipFor(entry, options.home);
  item.contextValue = entry.killable ? CONTEXT_PROCESS : CONTEXT_PROTECTED;
  item.iconPath = new vscode.ThemeIcon(
    entry.killable ? 'plug' : 'lock',
    new vscode.ThemeColor(entry.killable ? 'charts.blue' : 'descriptionForeground')
  );

  if (entry.killable) {
    item.checkboxState = options.checked
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
  }

  item.entry = entry;
  return item;
}

/** 详情子节点; 不可勾选, 也没有右键动作。 */
function detail(label: string): PortItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.contextValue = CONTEXT_DETAIL;
  item.iconPath = new vscode.ThemeIcon('circle-small-filled', new vscode.ThemeColor('descriptionForeground'));
  return item;
}

export function createDetailItems(entry: ProcessEntry, home: string): PortItem[] {
  const unknown = vscode.l10n.t('unknown');
  const rows = [
    `PID: ${entry.pid ?? unknown}  ·  PPID: ${entry.ppid ?? unknown}  ·  ${entry.user || unknown}`,
    `${vscode.l10n.t('Uptime')}: ${entry.etime || unknown}`,
    `${vscode.l10n.t('Working directory')}: ${entry.cwd ? shortenPath(entry.cwd, home) : unknown}`,
    `${vscode.l10n.t('Listening on')}: ${entry.listeners.map(formatListener).join('  ·  ')}`,
    `${vscode.l10n.t('Command')}: ${entry.command || unknown}`,
  ];
  return rows.map(detail);
}

/**
 * 扫描失败时的单条错误项。
 *
 * 刻意是列表里的一行而不是通知: 视图每几秒刷新一次, 每轮弹一次通知会把编辑器淹掉。
 */
export function createErrorItem(reason: string): PortItem {
  const item = new vscode.TreeItem(vscode.l10n.t('Port scan failed'), vscode.TreeItemCollapsibleState.None);
  item.description = reason;
  item.tooltip = reason;
  item.contextValue = CONTEXT_DETAIL;
  item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
  return item;
}
