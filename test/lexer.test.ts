import { describe, expect, it } from 'vitest';

import { classifyBrace, isContinuation, scanDocument } from '../src/core/lexer';
import type { LexConfig } from '../src/core/lexer';

import { snap } from './helpers';

const JS: LexConfig = {
  lineComment: '//',
  stringDelimiters: ['"', "'", '`'],
  blockComment: { open: '/*', close: '*/' },
};

const PY: LexConfig = {
  lineComment: '#',
  stringDelimiters: ['"""', "'''", '"', "'"],
};

const LUA: LexConfig = {
  lineComment: '--',
  stringDelimiters: ['"', "'"],
  blockComment: { open: '--[[', close: ']]' },
};

/** 第 index 行的入口状态。 */
const stateAt = (text: string, index: number, config: LexConfig = JS) =>
  scanDocument(snap(text), config)[index];

describe('classifyBrace', () => {
  it('头部收尾括号, 箭头函数与关键字之后是块', () => {
    expect(classifyBrace('function f(a) ')).toBe('block');
    expect(classifyBrace('list.map(x => ')).toBe('block');
    expect(classifyBrace('} else ')).toBe('block');
    expect(classifyBrace('try ')).toBe('block');
  });

  it('裸标识符收尾按块处理, 覆盖 class 与 Rust/Go 风格的条件', () => {
    expect(classifyBrace('class A ')).toBe('block');
    expect(classifyBrace('impl Foo ')).toBe('block');
    expect(classifyBrace('if x ')).toBe('block');
  });

  it('赋值, 实参与 return 之后是字面量', () => {
    expect(classifyBrace('const o = ')).toBe('literal');
    expect(classifyBrace('send(')).toBe('literal');
    expect(classifyBrace('return ')).toBe('literal');
    expect(classifyBrace('const v = a || ')).toBe('literal');
    expect(classifyBrace('  key: ')).toBe('literal');
  });

  it('判不出来时返回 null', () => {
    // 空前缀只可能出现在 `{` 独占一行时, 而那时调用方会改用上一行的代码。
    expect(classifyBrace('')).toBeNull();
    expect(classifyBrace('   ')).toBeNull();
    expect(classifyBrace('loop: ')).toBe('literal');
  });
});

describe('isContinuation', () => {
  it('行尾留运算符时是续行', () => {
    expect(isContinuation('const ok = first &&')).toBe(true);
    expect(isContinuation('const s = a +')).toBe(true);
    expect(isContinuation('const s = a \\')).toBe(true);
    expect(isContinuation('const a = 1,')).toBe(true);
  });

  it('行首留运算符时上一行是续行', () => {
    // 三元与方法链的上一行行尾没有任何符号, 只能靠下一行行首判定。
    expect(isContinuation('const v = cond', '  ? a')).toBe(true);
    expect(isContinuation('  ? a', '  : b')).toBe(true);
    expect(isContinuation('foo()', '  .bar()')).toBe(true);
  });

  it('完整语句与块边界不是续行', () => {
    expect(isContinuation('const a = 1;', 'next();')).toBe(false);
    expect(isContinuation('}', 'next();')).toBe(false);
    expect(isContinuation('if (x) {', '  run();')).toBe(false);
  });

  it('Python 的块头不算续行', () => {
    // `:` 刻意不在行尾续行集合里 —— 它是 Python 的块开始。
    expect(isContinuation('def f(value):', '    return value')).toBe(false);
  });
});

describe('scanDocument', () => {
  it('状态表长度为 lineCount + 1', () => {
    const text = 'const a = 1;\nconst b = 2;\n';
    const snapshot = snap(text);
    expect(scanDocument(snapshot, JS)).toHaveLength(snapshot.lineCount + 1);
  });

  it('未闭合的括号留在栈上, 并记录种类与位置', () => {
    const text = 'send(\n  payload,\n  headers\n);\n';
    const state = stateAt(text, 1);
    expect(state.stack).toHaveLength(1);
    expect(state.stack[0].kind).toBe('paren');
    expect(state.stack[0].line).toBe(0);
  });

  it('区分块花括号与字面量花括号', () => {
    const block = stateAt('function f(a) {\n  return a;\n}\n', 1);
    expect(block.stack.map((item) => item.kind)).toEqual(['brace-block']);

    const literal = stateAt('const o = {\n  name: 1,\n};\n', 1);
    expect(literal.stack.map((item) => item.kind)).toEqual(['brace-literal']);
  });

  it('花括号独占一行时回看上一行判定种类 (Allman 风格)', () => {
    const state = stateAt('if (ready)\n{\n  run();\n}\n', 2);
    expect(state.stack.map((item) => item.kind)).toEqual(['brace-block']);
  });

  it('嵌套时栈按顺序保留', () => {
    const state = stateAt('function f() {\n  send({\n    a: 1,\n  });\n}\n', 2);
    expect(state.stack.map((item) => item.kind)).toEqual(['brace-block', 'paren', 'brace-literal']);
  });

  it('跨行模板字符串在行入口仍是未闭合状态', () => {
    const state = stateAt('const s = `line1\nline2`;\n', 1);
    expect(state.openQuote).toBe('`');
  });

  it('块注释跨行保持', () => {
    const inside = stateAt('/*\nhidden\n*/\nnext();\n', 1);
    expect(inside.inBlockComment).toBe(true);
    const after = stateAt('/*\nhidden\n*/\nnext();\n', 3);
    expect(after.inBlockComment).toBe(false);
  });

  it('字符串里的花括号与注释符不影响状态', () => {
    const state = stateAt('const s = "{ // not code";\nnext();\n', 1);
    expect(state.stack).toEqual([]);
    expect(state.openQuote).toBeNull();
  });

  it('Python 三引号按一个定界符处理', () => {
    const inside = stateAt('s = """\ninner "quoted" value\n"""\nnext()\n', 1, PY);
    expect(inside.openQuote).toBe('"""');
    // 三引号内部出现单个双引号时不能被提前闭合。
    expect(stateAt('s = """\ninner "quoted" value\n"""\nnext()\n', 2, PY).openQuote).toBe('"""');
    expect(stateAt('s = """\ninner "quoted" value\n"""\nnext()\n', 3, PY).openQuote).toBeNull();
  });

  it('Lua 的 --[[ 是块注释而不是行注释', () => {
    const state = stateAt('--[[\nhidden\n]]\nnext()\n', 1, LUA);
    expect(state.inBlockComment).toBe(true);
    expect(stateAt('--[[\nhidden\n]]\nnext()\n', 3, LUA).inBlockComment).toBe(false);
  });

  it('多余的闭符不会让栈变成负深度', () => {
    const state = stateAt('}\n}\nnext();\n', 2);
    expect(state.stack).toEqual([]);
  });
});
