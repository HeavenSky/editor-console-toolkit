import type { L10n, Step } from "./types";

/**
 * 两个清理命令要调用的命令清单。
 *
 * 清单按 VS Code 1.142.0 与当时的扩展版本逐条读处理函数核实: 是否弹框, 依赖哪个界面,
 * 作用范围。编辑器以后改名或删掉的命令在运行时落到"跳过", 不会报错, 但需要定期复核。
 *
 * 刻意不收录的命令(弹列表让用户挑, 需要传参, 或只是界面状态而不是历史与缓存)不在这里出现;
 * 带确认框的命令只有存在不弹框的等价命令时才替换, 例如编辑器历史用 `...WithoutConfirm`。
 */

const COPILOT_CHAT = "GitHub.copilot-chat";

/** 清理历史与缓存: 一次确认后全部执行。 */
export function historySteps(l10n: L10n): Step[] {
	const step = (
		id: string,
		label: string,
		options: Partial<Omit<Step, "id" | "label">> = {}
	): Step => ({ id, label, memoryOnly: false, prompts: false, workspaceOnly: false, ...options });

	return [
		// 打开快捷键编辑器本身会写进编辑器历史, 所以它排在清编辑器历史之前。
		step(
			"keybindings.editor.clearSearchHistory",
			l10n.t("Keyboard Shortcuts editor search history"),
			{ prepare: "keybindingsEditor" }
		),
		step("workbench.action.clearCommandHistory", l10n.t("Command Palette history"), {
			prompts: true,
		}),
		step(
			"workbench.action.clearEditorHistoryWithoutConfirm",
			l10n.t("Recently opened editors"),
			{ workspaceOnly: true }
		),
		step("workbench.action.clearRecentFiles", l10n.t("Recently opened files and folders"), {
			prompts: true,
		}),
		step("search.action.clearHistory", l10n.t("Search box history"), { workspaceOnly: true }),
		step(
			"workbench.action.terminal.clearPreviousSessionHistory",
			l10n.t("Terminal command and directory history")
		),
		step("workbench.action.chat.clearInputHistory", l10n.t("Chat input history")),
		step(
			"workbench.action.chat.clearRecentlyUsedLanguageModels",
			l10n.t("Recently used language models")
		),
		step("notebook.clearNotebookKernelsMRUCache", l10n.t("Recently used notebook kernels")),
		// ID 里的 Edtitor 是 VS Code 原拼写。
		step("notebook.clearNotebookEdtitorTypeCache", l10n.t("Notebook editor type cache")),
		step("testing.clearTestResults", l10n.t("Test results")),
		step("workbench.mcp.resetCachedTools", l10n.t("Cached MCP tool lists")),
		step(
			"workbench.action.browser.clearGlobalStorage",
			l10n.t("Built-in browser storage and cookies (signs you out of sites)")
		),
		step(
			"workbench.action.browser.clearWorkspaceStorage",
			l10n.t("Built-in browser storage for this workspace"),
			{ workspaceOnly: true }
		),
		step("voiceTranscripts.deleteAll", l10n.t("Local voice transcripts"), {
			prompts: true,
			prepare: "voiceTranscripts",
		}),
		step(
			"_workbench.extensions.action.cleanUpExtensionsFolder",
			l10n.t("Old extension versions and uninstall leftovers")
		),
		step(
			"workbench.profiles.actions.cleanupProfiles",
			l10n.t("Leftover folders of deleted profiles")
		),
		step("json.clearCache", l10n.t("JSON schema cache"), {
			extension: "vscode.json-language-features",
		}),
		step("references-view.clearHistory", l10n.t("References view history"), {
			extension: "vscode.references-view",
		}),
		step(
			"terminal.integrated.suggest.clearCachedGlobals",
			l10n.t("Cached commands for terminal suggestions"),
			{ extension: "vscode.terminal-suggest" }
		),
		step(
			"github.copilot.chat.cloudSessions.clearCaches",
			l10n.t("Copilot cloud agent options cache"),
			{ extension: COPILOT_CHAT, memoryOnly: true }
		),
		step(
			"github.copilot.debug.inlineEdit.clearCache",
			l10n.t("Copilot next edit suggestions cache"),
			{ extension: COPILOT_CHAT, memoryOnly: true }
		),
		step("rest-client.clear-history", l10n.t("REST Client request history"), {
			extension: "humao.rest-client",
		}),
		step(
			"rest-client.clear-aad-token-cache",
			l10n.t("REST Client Azure AD tokens (sign in again afterwards)"),
			{ extension: "humao.rest-client" }
		),
		step("git-graph.clearAvatarCache", l10n.t("Git Graph avatar cache"), {
			extension: "mhutchie.git-graph",
		}),
		step("w3cColorToolkit.clearIndexCache", l10n.t("W3C Color Toolkit color index"), {
			extension: "heavensky.w3c-color-toolkit",
			memoryOnly: true,
		}),
		step("bruno.clearLogs", l10n.t("Bruno log panel"), {
			extension: "bruno-api-client.bruno",
			memoryOnly: true,
		}),
	];
}

/** 删除工作数据: 多选列表默认全选, 只执行勾选项。 */
export function workDataSteps(l10n: L10n): Step[] {
	const base = { memoryOnly: false, prompts: true, workspaceOnly: false };
	return [
		{
			...base,
			id: "workbench.action.chat.clearHistory",
			workspaceOnly: true,
			label: l10n.t("Chat sessions in this workspace"),
			detail: l10n.t(
				"Deletes chatSessions in this workspace's storage; ~/.claude is untouched. VS Code asks again when there are sessions."
			),
		},
		{
			...base,
			id: "workbench.action.localHistory.deleteAll",
			label: l10n.t("Local History of every file"),
			detail: l10n.t(
				"Deletes the History folder in your user data folder. VS Code asks again."
			),
		},
		{
			...base,
			id: "workbench.editSessions.actions.deleteAll",
			label: l10n.t("Cloud Edit Sessions"),
			detail: l10n.t("Deletes every working change stored in the cloud. VS Code asks again."),
		},
		{
			...base,
			id: "github.copilot.chat.tools.memory.clearMemories",
			extension: COPILOT_CHAT,
			label: l10n.t("Copilot memories"),
			detail: l10n.t(
				"Deletes memory-tool/memories in Copilot's global storage and in this workspace's storage. Copilot asks again."
			),
		},
		{
			...base,
			id: "github.copilot.deleteExternalIngestWorkspaceIndex",
			extension: COPILOT_CHAT,
			prompts: false,
			workspaceOnly: true,
			label: l10n.t("Copilot codebase index for this workspace"),
			detail: l10n.t(
				"Deletes the semantic index; rebuilding it takes a while. No further confirmation."
			),
		},
	];
}
