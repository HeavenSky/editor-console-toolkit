import * as vscode from "vscode";

import { historySteps, workDataSteps } from "./catalog";
import { runSteps, skipReason } from "./runner";
import type { ExtensionState, Step, StepResult, Summary } from "./types";

/**
 * 清理命令的 VS Code 边界: 确认, 进度, 结果汇总与输出面板明细。
 *
 * 本插件自己不删任何文件, 只逐条调用编辑器与其它扩展已有的命令; 那些命令自带的确认框原样
 * 保留。该域没有监听器与激活期动作, 只有用户执行命令时才运行。
 */

/** 不弹框条目的单条超时; 超时只记为未完成, 命令本身仍在后台继续。 */
const STEP_TIMEOUT_MS = 30_000;

function extensionState(id: string): ExtensionState {
	const extension = vscode.extensions.getExtension(id);
	if (extension === undefined) return "missing";
	return extension.isActive ? "active" : "inactive";
}

/** 执行前就会被跳过的条目不出现在确认框与多选列表里。 */
function runnable(steps: Step[]): Step[] {
	return steps.filter(
		step =>
			skipReason(
				step,
				step.extension === undefined ? undefined : extensionState(step.extension)
			) === undefined
	);
}

/**
 * 快捷键编辑器的清搜索历史只对活动的快捷键编辑器生效, 所以先打开它再执行。
 *
 * 执行前没打开的, 执行后把这一个标签关掉, 焦点自然回到原编辑器; 本来就开着的, 回到原先
 * 活动的编辑器。只按"打开后的活动标签"定位, 不比较标签集合, 免得误关用户自己的标签。
 */
async function inKeybindingsEditor(run: () => Thenable<unknown>): Promise<void> {
	const groups = vscode.window.tabGroups;
	const keyOf = (tab: vscode.Tab | undefined) => tab && `${tab.group.viewColumn}:${tab.label}`;
	const previous = keyOf(groups.activeTabGroup.activeTab);
	const existing = groups.all.flatMap(group =>
		group.tabs.filter(tab => tab.input === undefined).map(tab => keyOf(tab))
	);

	await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings");
	const opened = groups.activeTabGroup.activeTab;
	try {
		await run();
	} finally {
		const key = keyOf(opened);
		if (opened && opened.input === undefined && !existing.includes(key)) {
			await groups.close(opened);
		} else if (previous !== undefined && previous !== key) {
			await vscode.commands.executeCommand("workbench.action.openPreviousRecentlyUsedEditor");
		}
	}
}

async function execute(step: Step): Promise<void> {
	const run = () => vscode.commands.executeCommand(step.id);
	if (step.prepare === "keybindingsEditor") return inKeybindingsEditor(run);
	// 语音转写的 Delete All 只对可见的转写视图生效; 这条命令会让视图出现并等它打开。
	// 语音功能不可用时它不存在, 抛出的"命令不存在"让该条落到跳过。
	if (step.prepare === "voiceTranscripts") {
		await vscode.commands.executeCommand("agentsVoice.showTranscripts");
	}
	await run();
}

function statusText(result: StepResult): string {
	switch (result.status) {
		case "done":
			return vscode.l10n.t("Ran");
		case "failed":
			return vscode.l10n.t("Failed");
		case "timeout":
			return vscode.l10n.t("Unfinished");
		case "skipped":
			return vscode.l10n.t("Skipped");
	}
}

function reasonText(result: StepResult): string | undefined {
	switch (result.reason) {
		case "not-installed":
			return vscode.l10n.t("extension not installed");
		case "inactive":
			return vscode.l10n.t("extension not running, nothing cached");
		case "not-found":
			return vscode.l10n.t("command not available in this editor");
	}
	if (result.status === "timeout") {
		return vscode.l10n.t("no response within {0} seconds", STEP_TIMEOUT_MS / 1000);
	}
	return result.detail;
}

function log(channel: vscode.OutputChannel, title: string, summary: Summary): void {
	channel.appendLine(`[${new Date().toLocaleString()}] ${title}`);
	for (const result of summary.results) {
		const reason = reasonText(result);
		channel.appendLine(
			`  ${statusText(result)}  ${result.step.id}  ${result.step.label}${reason ? ` — ${reason}` : ""}`
		);
	}
	channel.appendLine("");
}

async function report(channel: vscode.OutputChannel, summary: Summary): Promise<void> {
	const scoped = summary.results
		.filter(result => result.status === "done" && result.step.workspaceOnly)
		.map(result => result.step.label);
	const message =
		scoped.length === 0
			? vscode.l10n.t(
					"Ran {0}, skipped {1}, failed {2}, unfinished {3}.",
					summary.done,
					summary.skipped,
					summary.failed,
					summary.timeout
				)
			: vscode.l10n.t(
					"Ran {0}, skipped {1}, failed {2}, unfinished {3}. Only the current workspace was affected for: {4}.",
					summary.done,
					summary.skipped,
					summary.failed,
					summary.timeout,
					scoped.join(", ")
				);
	const details = vscode.l10n.t("Show Details");
	const show =
		summary.failed + summary.timeout > 0
			? vscode.window.showWarningMessage(message, details)
			: vscode.window.showInformationMessage(message, details);
	if ((await show) === details) channel.show(true);
}

async function run(
	channel: vscode.OutputChannel,
	title: string,
	steps: readonly Step[]
): Promise<void> {
	const summary = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title },
		progress =>
			runSteps(
				{
					extensionState,
					execute,
					timeoutMs: STEP_TIMEOUT_MS,
					onStep: (index, total, step) =>
						progress.report({ message: `${index}/${total} ${step.label}` }),
				},
				steps
			)
	);
	log(channel, title, summary);
	await report(channel, summary);
}

async function clearHistory(channel: vscode.OutputChannel): Promise<void> {
	const steps = runnable(historySteps(vscode.l10n));
	const scope = vscode.l10n.t("(this workspace only)");
	const list = steps
		.map(step => `• ${step.label}${step.workspaceOnly ? ` ${scope}` : ""}`)
		.join("\n");
	const detail = [
		vscode.l10n.t("The following will be cleared:"),
		list,
		"",
		vscode.l10n.t(
			"Command Palette history, recent files and voice transcripts ask again before clearing. Close other editor windows first: a window left open may write its own history back when it closes."
		),
	].join("\n");

	const clear = vscode.l10n.t("Clear");
	const answer = await vscode.window.showWarningMessage(
		vscode.l10n.t("Clear the editor's history and caches?"),
		{ modal: true, detail },
		clear
	);
	if (answer !== clear) return;
	await run(channel, vscode.l10n.t("Clearing history and caches"), steps);
}

async function deleteWorkData(channel: vscode.OutputChannel): Promise<void> {
	const scope = vscode.l10n.t("This workspace only");
	const items = runnable(workDataSteps(vscode.l10n)).map(step => ({
		label: step.label,
		description: step.workspaceOnly ? scope : undefined,
		detail: step.detail,
		picked: true,
		step,
	}));
	const picked = await vscode.window.showQuickPick(items, {
		canPickMany: true,
		title: vscode.l10n.t("Delete Work Data"),
		placeHolder: vscode.l10n.t("Checked items are deleted and cannot be restored"),
		matchOnDetail: true,
	});
	if (picked === undefined || picked.length === 0) return;
	await run(
		channel,
		vscode.l10n.t("Deleting work data"),
		picked.map(item => item.step)
	);
}

export function registerCleanupCommands(context: vscode.ExtensionContext): void {
	let channel: vscode.OutputChannel | undefined;
	const output = (): vscode.OutputChannel => {
		if (channel === undefined) {
			channel = vscode.window.createOutputChannel(vscode.l10n.t("Cleanup Toolkit"));
			context.subscriptions.push(channel);
		}
		return channel;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand("editorConsoleToolkit.cleanup.clearHistory", () =>
			clearHistory(output())
		),
		vscode.commands.registerCommand("editorConsoleToolkit.cleanup.deleteWorkData", () =>
			deleteWorkData(output())
		)
	);
}
