/**
 * cleanup 功能域的公共契约。
 *
 * 清理动作全部是调用编辑器或其它扩展已有的命令, 本插件自己不碰任何存储; 编排层通过
 * `RunSeam` 拿到"执行一条命令"与"查询扩展状态"两个能力, 因此可以脱离 vscode 运行时测试。
 */

/** 执行前必须先打开的界面: 对应命令的处理函数只对当前活动的那个界面生效。 */
export type Prepare = "keybindingsEditor" | "voiceTranscripts";

export interface Step {
	/** 被调用的命令 ID。 */
	id: string;
	/** 贡献该命令的扩展 ID; 编辑器本体命令为 undefined。 */
	extension?: string;
	/** 只清进程内存: 扩展未激活时内存里本来就没有东西, 跳过而不是为清理去启动它。 */
	memoryOnly: boolean;
	/** 命令自己会弹确认框; 这类条目排在最后且不设超时, 用户可能正在看框。 */
	prompts: boolean;
	prepare?: Prepare;
	/** 只作用于当前工作区。 */
	workspaceOnly: boolean;
	/** 清理对象, 已本地化。 */
	label: string;
	/** 删除位置等补充说明, 已本地化; 只在删除工作数据的多选列表里显示。 */
	detail?: string;
}

export type ExtensionState = "missing" | "inactive" | "active";

export type SkipReason = "not-installed" | "inactive" | "not-found";

export type StepStatus = "done" | "skipped" | "failed" | "timeout";

export interface StepResult {
	step: Step;
	status: StepStatus;
	reason?: SkipReason;
	/** 失败时的错误首行。 */
	detail?: string;
}

export interface Summary {
	done: number;
	skipped: number;
	failed: number;
	timeout: number;
	results: StepResult[];
}

export interface RunSeam {
	extensionState(id: string): ExtensionState;
	/** 执行一条命令, 含 `prepare` 要求的前置界面处理。 */
	execute(step: Step): Promise<void>;
	/** 每条开始前回调, `index` 从 1 开始; 用于进度通知。 */
	onStep?(index: number, total: number, step: Step): void;
	/** 不弹框条目的单条超时, 毫秒。 */
	timeoutMs: number;
}

/** catalog 只需要 `vscode.l10n.t` 的这一个签名, 测试里传入恒等函数。 */
export interface L10n {
	t(message: string): string;
}
