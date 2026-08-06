import { describe, expect, it } from 'vitest';

import { classifyOffset, locateAnchor } from '../src/core/statementScanner';
import type { ScanConfig } from '../src/core/statementScanner';
import { resolveSelection } from '../src/core/selectionResolver';

import { caretIn, snap } from './helpers';

const JS: ScanConfig = { commentPrefix: '//', stringDelimiters: ['"', "'", '`'] };
const RUST: ScanConfig = { commentPrefix: '//', stringDelimiters: ['"'] };

/** 解析目标后定位插入锚点, 返回锚点行号或失败原因。 */
function anchorLine(text: string, needle: string, config: ScanConfig): number | string {
  const snapshot = snap(text);
  const target = resolveSelection(snapshot, caretIn(text, needle), '');
  if (target.kind === 'unsupported') return target.code;
  const anchor = locateAnchor(snapshot, target, config);
  return anchor.kind === 'unsupported' ? anchor.code : anchor.line;
}

describe('classifyOffset', () => {
  it('区分代码, 注释与字符串', () => {
    const text = 'const a = 1; // note\nconst s = "text";';
    const snapshot = snap(text);
    expect(classifyOffset(snapshot, text.indexOf('a = 1'), JS)).toBe('code');
    expect(classifyOffset(snapshot, text.indexOf('note'), JS)).toBe('comment');
    expect(classifyOffset(snapshot, text.indexOf('text'), JS)).toBe('string');
  });

  it('字符串里的注释符不算注释', () => {
    const text = 'const s = "http://x"; const b = 2;';
    expect(classifyOffset(snap(text), text.indexOf('b = 2'), JS)).toBe('code');
  });

  it('转义引号不会提前结束字符串', () => {
    const text = "const s = 'a\\'b' + c;";
    expect(classifyOffset(snap(text), text.indexOf('c;'), JS)).toBe('code');
  });

  it('Rust 的生命周期不被当成字符串开头', () => {
    const text = "let name: &'static str = value;";
    const offset = text.indexOf('value');
    // 单引号算定界符时 `'static` 会打开一个一直不闭合的字符串, 让后面的代码被误判。
    expect(classifyOffset(snap(text), offset, JS)).toBe('string');
    expect(classifyOffset(snap(text), offset, RUST)).toBe('code');
  });
});

describe('locateAnchor', () => {
  it('单行语句的锚点就是本行', () => {
    expect(anchorLine('const user = 1;\n', 'user', JS)).toBe(0);
  });

  it('括号未闭合时继续向下找到语句结束行', () => {
    const text = 'const value = compute(\n  a,\n  b\n);\nnext();';
    expect(anchorLine(text, 'value', JS)).toBe(3);
  });

  it('嵌套括号只在整体闭合后收尾', () => {
    const text = 'const v = f(g(\n  1\n), h(\n  2\n));\n';
    expect(anchorLine(text, 'const v', JS)).toBe(4);
  });

  it('反斜杠续行时继续向下', () => {
    const text = 'const s = a + \\\n  b;\n';
    expect(anchorLine(text, 'const s', JS)).toBe(1);
  });

  it('跨行模板字符串按字符串状态延续', () => {
    const text = 'const s = `line1\nline2`;\nnext();';
    expect(anchorLine(text, 'const s', JS)).toBe(1);
  });

  it('光标在注释里报 cursor-in-comment', () => {
    expect(anchorLine('// const user = 1;\n', 'user', JS)).toBe('cursor-in-comment');
  });

  it('光标在字符串里报 cursor-in-string', () => {
    expect(anchorLine("const s = 'user';\n", 'user', JS)).toBe('cursor-in-string');
  });

  it('语句超过 50 行仍未闭合时报 unbalanced-syntax', () => {
    const text = `const v = f(\n${'  x,\n'.repeat(80)}`;
    expect(anchorLine(text, 'const v', JS)).toBe('unbalanced-syntax');
  });

  it('缩进取目标所在行的前导空白, 而不是锚点行的', () => {
    const text = '    const v = f(\n      a\n    );\n';
    const snapshot = snap(text);
    const target = resolveSelection(snapshot, caretIn(text, 'const v'), '');
    if (target.kind === 'unsupported') throw new Error('预期解析成功');
    const anchor = locateAnchor(snapshot, target, JS);
    if (anchor.kind === 'unsupported') throw new Error('预期定位成功');
    expect(anchor.indent).toBe('    ');
    expect(anchor.line).toBe(2);
  });
});
