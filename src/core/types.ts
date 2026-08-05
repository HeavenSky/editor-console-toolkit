/** 核心数据契约. 本文件与 core/ 下的其余模块都不 import vscode, 便于与编辑器解耦. */

export type OffsetRange = { start: number; end: number };

export type EndOfLine = '\n' | '\r\n';

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
  readonly lineCount: number;
  lineAt(index: number): LineInfo;
  lineOf(offset: number): number;
};

/** 选区以 offset 表达, anchor 可能大于 active(反向选择). */
export type SelectionLike = { anchor: number; active: number };

export type UnsupportedCode =
  | 'no-active-editor'
  | 'unsupported-language'
  | 'multiline-selection'
  | 'unbalanced-syntax'
  | 'cursor-in-comment'
  | 'cursor-in-string'
  | 'empty-target';

export type Unsupported = { kind: 'unsupported'; code: UnsupportedCode };

export type ExpressionTarget = {
  kind: 'target';
  /** 保留原始代码语法. */
  expression: string;
  /** 折叠连续空白后的展示文本. */
  label: string;
  sourceRange: OffsetRange;
  sourceLine: number;
};

export type InsertionAnchor = {
  kind: 'anchor';
  /** 目标所属逻辑语句的最后一行. */
  line: number;
  /** 插入位置, 等于锚点行的行尾 offset. */
  offset: number;
  /** 锚点行的前导空白. */
  indent: string;
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
  | { kind: 'insert'; offset: number; text: string }
  | { kind: 'delete'; range: OffsetRange };

export type EditPlan = {
  edits: PlannedEdit[];
  /** 首个失败原因; 只在一条编辑都没产出时用于提示. */
  firstReason: UnsupportedCode | null;
};

export function unsupported(code: UnsupportedCode): Unsupported {
  return { kind: 'unsupported', code };
}
