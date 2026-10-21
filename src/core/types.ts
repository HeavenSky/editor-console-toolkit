/** 核心数据契约. 本文件与 core/ 下的其余模块都不 import vscode, 便于与编辑器解耦. */

export type OffsetRange = { start: number; end: number };

export type EndOfLine = "\n" | "\r\n";

export type LineInfo = {
	index: number;
	/** 行首 offset. */
	start: number;
	/** 行尾 offset, 不含 \r 与 \n. */
	end: number;
	/** 行内容, 不含换行符. */
	text: string;
};

export type DocumentSnapshot = {
	readonly text: string;
	readonly languageId: string;
	readonly eol: EndOfLine;
	/**
	 * 一级缩进的字面文本, 例如两个空格或一个 tab.
	 *
	 * 只在往空块里插入日志时才用得上 —— 块里已有代码时一律照抄那一行的缩进, 与文件现有风格对齐.
	 * 与 eol 同类: 都是由编辑器决定, 由 runner 在建快照时传入, core 因此不必 import vscode.
	 */
	readonly indentUnit: string;
	readonly lineCount: number;
	lineAt(index: number): LineInfo;
	lineOf(offset: number): number;
};

/** 选区以 offset 表达, anchor 可能大于 active(反向选择). */
export type SelectionLike = { anchor: number; active: number };

export type UnsupportedCode =
	| "no-active-editor"
	| "unsupported-language"
	| "multiline-selection"
	| "unbalanced-syntax"
	| "cursor-in-comment"
	| "cursor-in-string"
	| "empty-target"
	| "no-managed-logs";

export type Unsupported = { kind: "unsupported"; code: UnsupportedCode };

export type ExpressionTarget = {
	kind: "target";
	/** 保留原始代码语法. */
	expression: string;
	/** 折叠连续空白后的展示文本. */
	label: string;
	sourceRange: OffsetRange;
	sourceLine: number;
};

export type InsertionAnchor = {
	kind: "anchor";
	/** 锚点行: 语句结束行, 或块开始行, 或不能容纳语句的那条语句本身. */
	line: number;
	/** 插入位置; placement 为 after-line 时是锚点行行尾, before-line 时是锚点行行首. */
	offset: number;
	/** 新行使用的前导空白. */
	indent: string;
	/** 日志放在锚点行之后还是之前. */
	placement: "after-line" | "before-line";
};

export type RenderLogInput = {
	/** 已剥离控制字符的前缀, 可能为空串. */
	prefix: string;
	label: string;
	expression: string;
};

export type RenderedLog = {
	/** 日志正文, 不含缩进, 不含换行, 不含所有权标记. */
	body: string;
};

export type PlannedEdit =
	| { kind: "insert"; offset: number; text: string }
	| { kind: "delete"; range: OffsetRange };

export type EditPlan = {
	edits: PlannedEdit[];
	/** 首个失败原因; 只在一条编辑都没产出时用于提示. */
	firstReason: UnsupportedCode | null;
};

export function unsupported(code: UnsupportedCode): Unsupported {
	return { kind: "unsupported", code };
}
