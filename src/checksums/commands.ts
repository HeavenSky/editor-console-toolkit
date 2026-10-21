import * as vscode from "vscode";

import { realFs, stagingDir } from "./fs";
import { applyChecksums, restoreChecksums } from "./runner";
import type { Outcome, RunContext } from "./types";

/**
 * 校验和命令的 VS Code 边界。
 *
 * 这是全插件唯一会写编辑器安装目录的地方, 因此边界上只做三件事:
 * 先挡掉写了也没有意义的环境, 再把 `Outcome` 翻译成提示, 权限不足时把等价的命令交回用户。
 * **本插件从不提权, 也从不代为执行那条命令** —— 命令只被展示与复制。
 *
 * 该域刻意没有监听器, 计时器与激活期动作: 只有用户执行命令时才会读盘。
 */

/** 环境不适用时返回原因; 适用则返回 undefined。 */
function unsupportedReason(): string | undefined {
	if (vscode.env.appRoot === "") {
		return vscode.l10n.t(
			"The editor installation folder cannot be located, so checksums cannot be fixed."
		);
	}
	// 远端扩展宿主里的 appRoot 指向远端的 server 安装, 改它对本机的编辑器毫无作用。
	if (vscode.env.appHost !== "desktop" || vscode.env.remoteName !== undefined) {
		return vscode.l10n.t("Checksums can only be fixed from a local desktop window.");
	}
	return undefined;
}

function runContext(): RunContext {
	return {
		fs: realFs,
		appRoot: vscode.env.appRoot,
		version: vscode.version,
		platform: process.platform,
		stagingDir,
	};
}

/**
 * 附加信息各自一条独立提示, 而不是拼进主提示。
 *
 * 源字符串就是 l10n 的 lookup key, 把两条本地化文案拼成一句会让翻译无从对应。
 */
function reportExtras(outcome: Outcome): void {
	if (outcome.missing > 0) {
		void vscode.window.showInformationMessage(
			vscode.l10n.t(
				"{0} files listed in product.json are missing and were skipped.",
				outcome.missing
			)
		);
	}
	if (outcome.cleaned > 0) {
		void vscode.window.showInformationMessage(
			vscode.l10n.t(
				"Removed {0} stale backups left by earlier editor versions.",
				outcome.cleaned
			)
		);
	}
}

async function reportPermissionDenied(outcome: Outcome): Promise<void> {
	const command = outcome.command ?? "";
	const message =
		outcome.stagedPath === undefined
			? vscode.l10n.t(
					"No write access to the editor installation. Run this in a terminal with administrator rights, then fully quit and reopen the editor: {0}",
					command
				)
			: vscode.l10n.t(
					"No write access to the editor installation. The new product.json has been staged at {0}. Run this in a terminal with administrator rights, then fully quit and reopen the editor: {1}",
					outcome.stagedPath,
					command
				);

	const copy = vscode.l10n.t("Copy command");
	const answer = await vscode.window.showErrorMessage(message, copy);
	if (answer === copy) await vscode.env.clipboard.writeText(command);
}

async function report(outcome: Outcome): Promise<void> {
	switch (outcome.kind) {
		case "no-checksums":
			void vscode.window.showInformationMessage(
				vscode.l10n.t(
					"This installation does not list any checksums, so there is nothing to fix."
				)
			);
			break;
		case "unchanged":
			void vscode.window.showInformationMessage(
				vscode.l10n.t("No changes to checksums were necessary.")
			);
			break;
		case "applied":
			void vscode.window.showInformationMessage(
				vscode.l10n.t(
					"Fixed {0} checksums. Fully quit and reopen the editor to see the effect; reloading the window is not enough.",
					outcome.changed
				)
			);
			break;
		case "restored":
			void vscode.window.showInformationMessage(
				vscode.l10n.t(
					"Restored the product.json saved before the first fix. Fully quit and reopen the editor to see the effect; reloading the window is not enough."
				)
			);
			break;
		case "no-backup":
			void vscode.window.showInformationMessage(
				vscode.l10n.t(
					"No backup written by this extension was found, so there is nothing to restore."
				)
			);
			break;
		case "read-failed":
			void vscode.window.showErrorMessage(
				vscode.l10n.t("product.json could not be read: {0}", outcome.detail ?? "")
			);
			break;
		case "write-failed":
			void vscode.window.showErrorMessage(
				vscode.l10n.t("Writing product.json failed: {0}", outcome.detail ?? "")
			);
			break;
		case "permission-denied":
			await reportPermissionDenied(outcome);
			break;
	}
	reportExtras(outcome);
}

async function run(command: (ctx: RunContext) => Outcome): Promise<void> {
	const reason = unsupportedReason();
	if (reason !== undefined) {
		void vscode.window.showErrorMessage(reason);
		return;
	}
	await report(command(runContext()));
}

export function registerChecksumCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("editorConsoleToolkit.checksums.apply", () =>
			run(applyChecksums)
		),
		vscode.commands.registerCommand("editorConsoleToolkit.checksums.restore", () =>
			run(restoreChecksums)
		)
	);
}
