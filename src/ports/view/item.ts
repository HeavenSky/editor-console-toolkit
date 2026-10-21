import * as vscode from "vscode";

import { shortenPath } from "../filter";
import type { Listener, ProcessEntry } from "../types";

/**
 * 视图项构造。
 *
 * 根节点是**进程**而不是端口: 终止的单位本来就是进程, 以进程为根才能让"勾了几行"与
 * "杀了几个进程"永远一致。端口聚合到该行的 description 里。
 */

/** `contextValue` 决定右键菜单; 只有 `portProcess` 会拿到终止项。 */
export const CONTEXT_PROCESS = "portProcess";
export const CONTEXT_PROTECTED = "portProtected";
export const CONTEXT_DETAIL = "portDetail";
/** 搜索行的两态; 只有 active 那一态会拿到清空按钮。 */
export const CONTEXT_SEARCH_ACTIVE = "portSearchActive";
export const CONTEXT_SEARCH_IDLE = "portSearchIdle";

export interface PortItem extends vscode.TreeItem {
	/** 详情子节点与错误项没有 entry。 */
	readonly entry?: ProcessEntry;
}

const formatListener = (listener: Listener): string =>
	`${listener.protocol} ${listener.address}:${listener.port}`;

/** 不可终止的原因转成一句可读说明; 源串即 l10n 的 lookup key, 所以必须是字面量。 */
function blockedLabel(entry: ProcessEntry): string | undefined {
	switch (entry.blockedReason) {
		case "protected-ancestor":
			return vscode.l10n.t("the editor itself");
		case "other-user":
			return vscode.l10n.t("another user, needs elevation");
		case "unknown-pid":
			return vscode.l10n.t("owner unknown");
		default:
			return undefined;
	}
}

function tooltipFor(entry: ProcessEntry, home: string): vscode.MarkdownString {
	const tooltip = new vscode.MarkdownString();
	const unknown = vscode.l10n.t("unknown");

	tooltip.appendMarkdown(`**${entry.name || unknown}**\n\n`);
	tooltip.appendMarkdown(
		`PID: \`${entry.pid ?? unknown}\`  ·  PPID: \`${entry.ppid ?? unknown}\`\n\n`
	);
	tooltip.appendMarkdown(`${vscode.l10n.t("User")}: ${entry.user || unknown}\n\n`);
	tooltip.appendMarkdown(`${vscode.l10n.t("Uptime")}: ${entry.etime || unknown}\n\n`);
	tooltip.appendMarkdown(
		`${vscode.l10n.t("Working directory")}: ${entry.cwd ? shortenPath(entry.cwd, home) : unknown}\n\n`
	);
	tooltip.appendMarkdown(
		`${vscode.l10n.t("Listening on")}: ${entry.listeners.map(formatListener).join(" · ")}\n\n`
	);
	if (entry.command)
		tooltip.appendMarkdown(`${vscode.l10n.t("Command")}:\n\n\`${entry.command}\`\n`);

	const blocked = blockedLabel(entry);
	if (blocked)
		tooltip.appendMarkdown(`\n---\n${vscode.l10n.t("Cannot be terminated:")} ${blocked}\n`);

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
		entry.name || vscode.l10n.t("unknown"),
		vscode.TreeItemCollapsibleState.Collapsed
	) as vscode.TreeItem & { entry?: ProcessEntry };

	const ports = entry.listeners.map(listener => listener.port).join(", ");
	const marks: string[] = [ports];
	if (entry.origin === "workspace") marks.push(vscode.l10n.t("this workspace"));
	const blocked = blockedLabel(entry);
	if (blocked) marks.push(blocked);
	item.description = marks.join("  ·  ");

	item.tooltip = tooltipFor(entry, options.home);
	item.contextValue = entry.killable ? CONTEXT_PROCESS : CONTEXT_PROTECTED;
	item.iconPath = new vscode.ThemeIcon(
		entry.killable ? "plug" : "lock",
		new vscode.ThemeColor(entry.killable ? "charts.blue" : "descriptionForeground")
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
	item.iconPath = new vscode.ThemeIcon(
		"circle-small-filled",
		new vscode.ThemeColor("descriptionForeground")
	);
	return item;
}

export function createDetailItems(entry: ProcessEntry, home: string): PortItem[] {
	const unknown = vscode.l10n.t("unknown");
	const rows = [
		`PID: ${entry.pid ?? unknown}  ·  PPID: ${entry.ppid ?? unknown}  ·  ${entry.user || unknown}`,
		`${vscode.l10n.t("Uptime")}: ${entry.etime || unknown}`,
		`${vscode.l10n.t("Working directory")}: ${entry.cwd ? shortenPath(entry.cwd, home) : unknown}`,
		`${vscode.l10n.t("Listening on")}: ${entry.listeners.map(formatListener).join("  ·  ")}`,
		`${vscode.l10n.t("Command")}: ${entry.command || unknown}`,
	];
	return rows.map(detail);
}

/**
 * 扫描失败时的单条错误项。
 *
 * 刻意是列表里的一行而不是通知: 视图每几秒刷新一次, 每轮弹一次通知会把编辑器淹掉。
 */
export function createErrorItem(reason: string): PortItem {
	const item = new vscode.TreeItem(
		vscode.l10n.t("Port scan failed"),
		vscode.TreeItemCollapsibleState.None
	);
	item.description = reason;
	item.tooltip = reason;
	item.contextValue = CONTEXT_DETAIL;
	item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("charts.yellow"));
	return item;
}

/**
 * 列表首行的搜索行。
 *
 * 一行同时承担三件事: 把当前搜索词显示出来(否则过滤是隐形的, 用户只会觉得"进程怎么少了"),
 * 当作打开输入框的入口, 以及在有过滤时通过 `contextValue` 让清空按钮出现 —— 树行内的
 * inline 按钮只能整个显示或隐藏, 没有置灰态, 所以"不能点"在这里只能实现成"不存在"。
 */
export function createSearchItem(state: {
	search: string;
	shown: number;
	total: number;
}): PortItem {
	const active = state.search.trim() !== "";
	const item = new vscode.TreeItem(
		active ? vscode.l10n.t("Search: {0}", state.search) : vscode.l10n.t("Search"),
		vscode.TreeItemCollapsibleState.None
	);

	item.description = active
		? vscode.l10n.t("{0} of {1} shown", state.shown, state.total)
		: vscode.l10n.t("for example 3000, node, ~/repo");
	item.tooltip = vscode.l10n.t("Filter by process name, command, PID, working directory or port");
	item.contextValue = active ? CONTEXT_SEARCH_ACTIVE : CONTEXT_SEARCH_IDLE;
	item.iconPath = new vscode.ThemeIcon(
		active ? "filter-filled" : "search",
		new vscode.ThemeColor(active ? "charts.blue" : "descriptionForeground")
	);
	// 这个 title 不进任何菜单, 因此刻意不走 l10n: 走了会往中文 bundle 里加一条谁都看不见的条目。
	item.command = { command: "editorConsoleToolkit.ports.search", title: "Search Ports" };
	return item;
}
