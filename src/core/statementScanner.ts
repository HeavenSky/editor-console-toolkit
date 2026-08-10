import { classifyAt, scanDocument } from './lexer';
import type { LexConfig } from './lexer';
import { unsupported } from './types';
import type { DocumentSnapshot, ExpressionTarget, InsertionAnchor, Unsupported } from './types';

/** 单条语句允许跨越的最大行数, 防止未闭合语法把扫描拖到文件末尾. */
const MAX_STATEMENT_LINES = 50;

export type ScanConfig = {
  commentPrefix: string;
  /** 本语言的字符串定界符. Rust 只有 `"`, 否则生命周期 `'a` 会被当成字符串开头. */
  stringDelimiters: readonly string[];
  /** 块注释的开闭符; 没有块注释的语言(Python, Ruby, Elixir)不填. */
  blockComment?: { open: string; close: string };
};

export const toLexConfig = (config: ScanConfig): LexConfig => ({
  lineComment: config.commentPrefix,
  stringDelimiters: config.stringDelimiters,
  blockComment: config.blockComment
});

type LineState = {
  depth: number;
  /** 未闭合时为当前定界符, 否则为 null. */
  openQuote: string | null;
  /** 本行进入单行注释的列, 没有则为 -1. */
  commentAt: number;
  /** 本行以反斜杠续行. */
  continued: boolean;
};

/**
 * 扫描一行, 返回行末状态. 括号深度累加到 depth 上, 字符串状态跨行保留
 * (JS 模板字符串和 Python 三引号都会跨行, 真正未闭合的字符串则由 MAX_STATEMENT_LINES 兜住).
 */
function scanLine(text: string, depth: number, openQuote: string | null, config: ScanConfig): LineState {
  let commentAt = -1;
  let quote = openQuote;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (text.startsWith(config.commentPrefix, i)) {
      commentAt = i;
      break;
    }
    if (config.stringDelimiters.includes(ch)) {
      quote = ch;
      i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    }
    i++;
  }
  const code = commentAt === -1 ? text : text.slice(0, commentAt);
  return { depth, openQuote: quote, commentAt, continued: /\\\s*$/.test(code) };
}

/**
 * 判断某个 offset 落在代码, 注释还是字符串字面量里.
 *
 * 走全文档状态表而不是只看本行前缀: 跨行模板字符串, Python 三引号与块注释里的光标只有拿到
 * 之前各行的状态才能判对. 旧实现从"本行开头, 深度归零"起算, 因此这三种情形都会被判成代码,
 * 日志被插进字符串或注释里.
 */
export function classifyOffset(
  snapshot: DocumentSnapshot,
  offset: number,
  config: ScanConfig
): 'code' | 'comment' | 'string' {
  const lexConfig = toLexConfig(config);
  return classifyAt(snapshot, offset, scanDocument(snapshot, lexConfig), lexConfig);
}

/**
 * 从目标所在行向下找到逻辑语句的结束行, 插入点是该行行尾.
 * 括号未闭合, 字符串未闭合或反斜杠续行时继续向下, 超过 MAX_STATEMENT_LINES 判为不安全.
 */
export function locateAnchor(
  snapshot: DocumentSnapshot,
  target: ExpressionTarget,
  config: ScanConfig
): InsertionAnchor | Unsupported {
  const classification = classifyOffset(snapshot, target.sourceRange.start, config);
  if (classification === 'comment') {
    return unsupported('cursor-in-comment');
  }
  if (classification === 'string') {
    return unsupported('cursor-in-string');
  }

  let depth = 0;
  let openQuote: string | null = null;
  const lastLine = Math.min(target.sourceLine + MAX_STATEMENT_LINES, snapshot.lineCount) - 1;
  for (let index = target.sourceLine; index <= lastLine; index++) {
    const line = snapshot.lineAt(index);
    const state = scanLine(line.text, depth, openQuote, config);
    depth = state.depth;
    openQuote = state.openQuote;
    if (depth <= 0 && openQuote === null && !state.continued) {
      return {
        kind: 'anchor',
        line: index,
        offset: line.end,
        indent: /^[ \t]*/.exec(snapshot.lineAt(target.sourceLine).text)![0]
      };
    }
    if (depth < 0) {
      depth = 0;
    }
  }
  return unsupported('unbalanced-syntax');
}
