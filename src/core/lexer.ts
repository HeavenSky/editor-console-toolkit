import type { DocumentSnapshot } from './types';

/**
 * 词法状态层.
 *
 * 这一层只回答"文档的每一行开始时, 我们处在什么词法状态里": 哪些定界符还没闭合, 是否卡在
 * 一个跨行字符串或块注释中间. 锚点策略不在这里, 见 statementScanner.ts.
 *
 * 为什么要有它: 只看目标行本身无法回答"我现在是不是在某个多行调用的参数列表里", 而这正是
 * 把日志插进括号内部的根因. 状态表按整份文档算一次, 多光标共用同一张表.
 */

/**
 * 未闭合定界符的种类.
 *
 * 花括号必须区分块与字面量: 块不需要在语句结束前闭合(日志可以落在块内), 而对象字面量必须
 * 闭合(否则日志会插到字面量中间, 产生语法错误).
 */
export type DelimiterKind = 'paren' | 'bracket' | 'brace-block' | 'brace-literal';

export type OpenDelimiter = {
  kind: DelimiterKind;
  line: number;
  column: number;
};

export type LexState = {
  stack: readonly OpenDelimiter[];
  /** 未闭合的字符串定界符, 否则 null. */
  openQuote: string | null;
  inBlockComment: boolean;
};

export type LexConfig = {
  lineComment: string;
  /** 字符串定界符; 可以是多字符, 例如 Python 的 `'''`. */
  stringDelimiters: readonly string[];
  blockComment?: { open: string; close: string };
};

/** 行尾出现这些符号时, 紧随的 `{` 是块: 头部的收尾括号, 箭头函数体, do 块. */
const BLOCK_TAIL_SYMBOLS = [')', '=>', '->'] as const;

/** 行尾是这些词时, 紧随的 `{` 是块. */
const BLOCK_TAIL_WORDS = ['else', 'do', 'try', 'finally', 'catch', 'then'] as const;

/** 行尾出现这些符号时, 紧随的 `{` 是对象字面量: 赋值, 实参, 数组元素, 键值对, 运算符右侧. */
const LITERAL_TAIL_SYMBOLS = ['==', '=>', '=', '(', ',', ':', '[', '{', '&&', '||', '??', '?', '+'] as const;

/** 行尾是这些词时, 紧随的 `{` 是字面量. */
const LITERAL_TAIL_WORDS = ['return', 'yield', 'in', 'of', 'typeof', 'new', 'await'] as const;

/** 行尾是这些符号时, 语句在下一行继续. `:` 刻意不在其中 —— Python 的 `:` 是块开始. */
const TRAILING_CONTINUATIONS = [
  '\\', '&&', '||', '??', '=>', '->', '==', '=', '+', '-', '*', '/', '%', '|', '&', '^', ',', '?', '.',
] as const;

/** 行首是这些符号时, 它是上一行的延续. 三元与方法链靠这一条, 因为上一行尾没有任何符号. */
const LEADING_CONTINUATIONS = [
  '&&', '||', '??', '=>', '->', '?', ':', '.', '+', '*', '/', '%', '|', '&', '^', ',',
] as const;

const WORD_TAIL = /([A-Za-z_$][\w$]*)$/;

/** 按长度降序匹配, 保证 `=>` 不被 `=` 抢走, `'''` 不被 `'` 抢走. */
const longestFirst = (values: readonly string[]): string[] =>
  [...values].sort((a, b) => b.length - a.length);

/**
 * 判定紧跟在给定代码之后的 `{` 是块还是字面量; 判不出来返回 null.
 *
 * 调用方对 null 一律按字面量处理(即"必须闭合"): 那样日志会落到整条语句之后, 位置偏外但
 * 语法一定合法; 反过来把字面量当成块会直接写出坏代码.
 */
export function classifyBrace(codeBeforeBrace: string): 'block' | 'literal' | null {
  const code = codeBeforeBrace.replace(/\s+$/, '');
  if (code === '') {
    return null;
  }

  const word = WORD_TAIL.exec(code)?.[1];
  if (word !== undefined) {
    if (BLOCK_TAIL_WORDS.includes(word as (typeof BLOCK_TAIL_WORDS)[number])) return 'block';
    if (LITERAL_TAIL_WORDS.includes(word as (typeof LITERAL_TAIL_WORDS)[number])) return 'literal';
    // 裸标识符收尾: `class A {`, `impl Foo {`, Rust/Go 的 `if x {`. 都是块.
    return 'block';
  }

  for (const symbol of longestFirst([...LITERAL_TAIL_SYMBOLS, ...BLOCK_TAIL_SYMBOLS])) {
    if (!code.endsWith(symbol)) continue;
    // `=>` 同时在两张表里, 块的语义优先: `x => {` 是函数体.
    if ((BLOCK_TAIL_SYMBOLS as readonly string[]).includes(symbol)) return 'block';
    return 'literal';
  }
  return null;
}

/**
 * 语句是否在下一行继续.
 *
 * 两个方向都要看: `a &&` 这类把运算符留在行尾的写法看当前行, `cond\n ? a` 与 `foo()\n .bar()`
 * 这类把运算符放在行首的写法只能看下一行 —— 后者的上一行行尾没有任何符号可查.
 */
export function isContinuation(codeOfLine: string, nextLineCode?: string): boolean {
  const code = codeOfLine.replace(/\s+$/, '');
  if (code !== '' && TRAILING_CONTINUATIONS.some((tail) => code.endsWith(tail))) {
    return true;
  }
  const next = (nextLineCode ?? '').trim();
  return next !== '' && LEADING_CONTINUATIONS.some((head) => next.startsWith(head));
}

/** 去掉行注释之后的代码部分; 只用于启发式判定, 不参与状态推进. */
export function stripLineComment(text: string, config: LexConfig): string {
  const index = text.indexOf(config.lineComment);
  return index === -1 ? text : text.slice(0, index);
}

/**
 * `{` 之前的代码.
 *
 * `{` 单独占一行时(Allman 风格)必须回看上一行, 否则拿到的是空串, 判定只能放弃.
 * 最多回看三行, 避免在残缺文件里一路上溯.
 */
function codeBeforeBrace(
  snapshot: DocumentSnapshot,
  config: LexConfig,
  line: number,
  column: number,
  text: string
): string {
  const head = text.slice(0, column);
  if (head.trim() !== '') {
    return head;
  }
  for (let probe = line - 1; probe >= 0 && line - probe <= 3; probe--) {
    const previous = stripLineComment(snapshot.lineAt(probe).text, config);
    if (previous.trim() !== '') {
      return previous;
    }
  }
  return '';
}

/**
 * 逐行推进词法状态, 返回每一行的**入口**状态.
 *
 * 返回数组长度为 `lineCount + 1`: 第 `i` 项是第 `i` 行开始时的状态, 末项是文件结束时的状态.
 */
export function scanDocument(snapshot: DocumentSnapshot, config: LexConfig): LexState[] {
  const delimiters = longestFirst(config.stringDelimiters);
  const states: LexState[] = [{ stack: [], openQuote: null, inBlockComment: false }];
  const stack: OpenDelimiter[] = [];
  let openQuote: string | null = null;
  let inBlockComment = false;

  for (let line = 0; line < snapshot.lineCount; line++) {
    const text = snapshot.lineAt(line).text;
    let i = 0;

    while (i < text.length) {
      if (inBlockComment) {
        const close = config.blockComment!.close;
        if (text.startsWith(close, i)) {
          inBlockComment = false;
          i += close.length;
        } else {
          i++;
        }
        continue;
      }

      if (openQuote !== null) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text.startsWith(openQuote, i)) {
          i += openQuote.length;
          openQuote = null;
          continue;
        }
        i++;
        continue;
      }

      // 块注释开符必须先试: Lua 的行注释 `--` 是块注释 `--[[` 的前缀, 顺序反了就永远进不了块注释.
      if (config.blockComment !== undefined && text.startsWith(config.blockComment.open, i)) {
        inBlockComment = true;
        i += config.blockComment.open.length;
        continue;
      }
      if (text.startsWith(config.lineComment, i)) {
        break;
      }

      const delimiter = delimiters.find((candidate) => text.startsWith(candidate, i));
      if (delimiter !== undefined) {
        openQuote = delimiter;
        i += delimiter.length;
        continue;
      }

      const ch = text[i];
      if (ch === '(') {
        stack.push({ kind: 'paren', line, column: i });
      } else if (ch === '[') {
        stack.push({ kind: 'bracket', line, column: i });
      } else if (ch === '{') {
        const kind = classifyBrace(codeBeforeBrace(snapshot, config, line, i, text));
        // 判不出来按字面量处理, 理由见 classifyBrace 的注释.
        stack.push({ kind: kind === 'block' ? 'brace-block' : 'brace-literal', line, column: i });
      } else if (ch === ')' || ch === ']' || ch === '}') {
        // 多余的闭符直接忽略, 不让栈变成负深度.
        if (stack.length > 0) stack.pop();
      }
      i++;
    }

    states.push({ stack: [...stack], openQuote, inBlockComment });
  }

  return states;
}

/** 某个 offset 落在代码, 行注释, 块注释还是字符串里; 块注释与跨行字符串都算准. */
export function classifyAt(
  snapshot: DocumentSnapshot,
  offset: number,
  states: readonly LexState[],
  config: LexConfig
): 'code' | 'comment' | 'string' {
  const index = snapshot.lineOf(offset);
  const line = snapshot.lineAt(index);
  const column = Math.max(0, Math.min(offset - line.start, line.text.length));
  const entry = states[index] ?? { stack: [], openQuote: null, inBlockComment: false };

  const delimiters = longestFirst(config.stringDelimiters);
  const text = line.text;
  let openQuote = entry.openQuote;
  let inBlockComment = entry.inBlockComment;
  let i = 0;

  while (i < column) {
    if (inBlockComment) {
      const close = config.blockComment!.close;
      if (text.startsWith(close, i)) {
        inBlockComment = false;
        i += close.length;
      } else {
        i++;
      }
      continue;
    }
    if (openQuote !== null) {
      if (text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text.startsWith(openQuote, i)) {
        i += openQuote.length;
        openQuote = null;
        continue;
      }
      i++;
      continue;
    }
    if (config.blockComment !== undefined && text.startsWith(config.blockComment.open, i)) {
      inBlockComment = true;
      i += config.blockComment.open.length;
      continue;
    }
    if (text.startsWith(config.lineComment, i)) {
      return 'comment';
    }
    const delimiter = delimiters.find((candidate) => text.startsWith(candidate, i));
    if (delimiter !== undefined) {
      openQuote = delimiter;
      i += delimiter.length;
      continue;
    }
    i++;
  }

  if (inBlockComment) return 'comment';
  return openQuote === null ? 'code' : 'string';
}
