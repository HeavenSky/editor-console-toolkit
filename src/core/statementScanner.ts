import {
  classifyAt,
  codeBeforeDelimiter,
  isContinuation,
  scanDocument,
  stripLineComment
} from './lexer';
import type { LexConfig, LexState, OpenDelimiter } from './lexer';
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
  /**
   * 语法上不能容纳语句的块的开启关键字, 例如 `switch` 的 case block 与 `class` 的 body.
   *
   * 命中时日志插到该语句**之前**一行: `switch` 的判别式与 `extends` 的基类都在进入该语句
   * 之前就已求值, 所以那个位置的语义是对的; 插进块里则是语法错误.
   */
  restrictedBlockKeywords?: readonly string[];
};

export const toLexConfig = (config: ScanConfig): LexConfig => ({
  lineComment: config.commentPrefix,
  stringDelimiters: config.stringDelimiters,
  blockComment: config.blockComment
});

const leadingWhitespace = (text: string): string => /^[ \t]*/.exec(text)![0];

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
 * 目标行入口栈里**不需要**闭合的项数.
 *
 * 只需闭合到最近的块边界: 包含目标的那个块不必闭合(日志正是要落在块内), 而块内侧的每个
 * 括号, 方括号与对象字面量都必须闭合, 否则日志会插到它们中间.
 */
function keptDepth(stack: readonly OpenDelimiter[]): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].kind === 'brace-block') {
      return i + 1;
    }
  }
  return 0;
}

/**
 * 块头里是否出现了"不能容纳语句"的关键字.
 *
 * 只在该行已被判为块开始时才查 —— 因此 `const type = { … }` 这类字面量不会被 `type` 误命中.
 * 用词边界匹配而不是行首前缀, 这样 `export class A {` 与 `public static class A {` 都能命中,
 * 而 `classify(a)` 不会被 `class` 误命中.
 */
function isRestrictedBlock(headerCode: string, keywords: readonly string[] | undefined): boolean {
  if (keywords === undefined || keywords.length === 0) {
    return false;
  }
  return new RegExp(`(^|[^\\w$])(${keywords.join('|')})([^\\w$]|$)`).test(headerCode);
}

/**
 * 块内第一条语句该用的缩进.
 *
 * 优先照抄块里已有那一行的缩进 —— 与文件现有风格一致, 混用 tab 与空格的仓库也不会错.
 * 只有空块才回退到"块头缩进 + 一级", 因为那时没有可抄的对象. 把闭合符那一行当成空块:
 * 抄它的缩进会得到与块头相同的缩进, 在 Python 下就是 IndentationError.
 */
function blockIndent(snapshot: DocumentSnapshot, anchorLine: number, blockLine: number): string {
  if (anchorLine + 1 < snapshot.lineCount) {
    const next = snapshot.lineAt(anchorLine + 1);
    const trimmed = next.text.trim();
    if (trimmed !== '' && !/^[)\]}]/.test(trimmed) && trimmed !== 'end') {
      return leadingWhitespace(next.text);
    }
  }
  return leadingWhitespace(snapshot.lineAt(blockLine).text) + snapshot.indentUnit;
}

/**
 * 找到日志该落在哪一行.
 *
 * 从目标行向下扫描, 在满足全部三条时收尾:
 * 1. **最内层未闭合的块之上没有任何未闭合的定界符** —— 括号, 方括号与对象字面量都必须闭合,
 *    否则日志会插进它们中间; 块自身不必闭合, 因为日志正是要落在块内. 少了这一条,
 *    `const v = f(` 会在目标行当场收尾, 日志被插进括号里;
 * 2. 不在未闭合字符串内, 也不在块注释内;
 * 3. 该行不是续行.
 *
 * 收尾时若最内层未闭合的块是在目标行之后新开的, 说明目标行开启了一个块, 日志落到块内第一条
 * 语句的位置; 否则日志落在语句之后, 缩进跟随目标行. 以"出口栈的最内层块"而不是"目标行入口栈"
 * 作边界, 是为了让 `list.map(item => {` 这种开在未闭合括号内的块也算块 —— 否则日志会被推到
 * `});` 之外, 而 `item` 在那里根本不在作用域内.
 */
export function locateAnchor(
  snapshot: DocumentSnapshot,
  target: ExpressionTarget,
  config: ScanConfig
): InsertionAnchor | Unsupported {
  const lexConfig = toLexConfig(config);
  const states = scanDocument(snapshot, lexConfig);

  const classification = classifyAt(snapshot, target.sourceRange.start, states, lexConfig);
  if (classification === 'comment') {
    return unsupported('cursor-in-comment');
  }
  if (classification === 'string') {
    return unsupported('cursor-in-string');
  }

  const targetIndent = leadingWhitespace(snapshot.lineAt(target.sourceLine).text);
  const kept = keptDepth(states[target.sourceLine].stack);
  const lastLine = Math.min(target.sourceLine + MAX_STATEMENT_LINES, snapshot.lineCount) - 1;

  for (let index = target.sourceLine; index <= lastLine; index++) {
    const line = snapshot.lineAt(index);
    const exit: LexState = states[index + 1];

    // 弹出了目标所在的块 —— 只可能出现在语法残缺的文件里. 就地收尾, 不继续向下扫,
    // 否则会一路扫到 MAX_STATEMENT_LINES 然后报"找不到安全位置".
    if (exit.stack.length < kept) {
      return { kind: 'anchor', line: index, offset: line.end, indent: targetIndent, placement: 'after-line' };
    }

    // 最内层块之上还有没闭合的括号或字面量时不能收尾.
    const aboveInnermostBlock = exit.stack.slice(keptDepth(exit.stack));
    if (aboveInnermostBlock.length > 0 || exit.openQuote !== null || exit.inBlockComment) {
      continue;
    }

    const code = stripLineComment(line.text, lexConfig);
    const nextCode =
      index + 1 < snapshot.lineCount ? stripLineComment(snapshot.lineAt(index + 1).text, lexConfig) : '';
    if (isContinuation(code, nextCode)) {
      continue;
    }

    const innermost = exit.stack[exit.stack.length - 1];
    // 块是在目标行或其后新开的 —— 那才说明目标行开启了一个块, 日志要落进去.
    const opensBlock =
      innermost !== undefined && innermost.kind === 'brace-block' && innermost.line >= target.sourceLine;

    if (opensBlock) {
      const header = codeBeforeDelimiter(snapshot, lexConfig, innermost.line, innermost.column);
      if (isRestrictedBlock(header.code, config.restrictedBlockKeywords)) {
        // 块里放不了语句, 只能把日志放到这条语句之前. 用关键字所在的那一行, 而不是 `{` 所在
        // 的行 —— Allman 风格下两者不是同一行, 插错会把日志夹在 `switch (x)` 与 `{` 之间.
        const headerLine = snapshot.lineAt(header.line);
        return {
          kind: 'anchor',
          line: header.line,
          offset: headerLine.start,
          indent: leadingWhitespace(headerLine.text),
          placement: 'before-line'
        };
      }
    }

    return {
      kind: 'anchor',
      line: index,
      offset: line.end,
      indent: opensBlock ? blockIndent(snapshot, index, innermost.line) : targetIndent,
      placement: 'after-line'
    };
  }

  return unsupported('unbalanced-syntax');
}
