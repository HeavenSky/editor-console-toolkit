import { describe, expect, it } from 'vitest';

import { classifyOffset, locateAnchor } from '../src/core/statementScanner';
import type { ScanConfig } from '../src/core/statementScanner';
import { resolveSelection } from '../src/core/selectionResolver';

import { caretIn, snap } from './helpers';

const JS: ScanConfig = {
  commentPrefix: '//',
  stringDelimiters: ['"', "'", '`'],
  blockComment: { open: '/*', close: '*/' },
};
const RUST: ScanConfig = { commentPrefix: '//', stringDelimiters: ['"'] };
const PY: ScanConfig = { commentPrefix: '#', stringDelimiters: ['"""', "'''", '"', "'"] };

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

  it('块注释里的光标算注释, 跨行也算', () => {
    const text = '/*\nconst hidden = 1;\n*/\nnext();';
    expect(classifyOffset(snap(text), text.indexOf('hidden'), JS)).toBe('comment');
    expect(classifyOffset(snap(text), text.indexOf('next'), JS)).toBe('code');
  });

  it('跨行模板字符串里的光标算字符串', () => {
    const text = 'const s = `\ninner value\n`;\nnext();';
    expect(classifyOffset(snap(text), text.indexOf('inner'), JS)).toBe('string');
    expect(classifyOffset(snap(text), text.indexOf('next'), JS)).toBe('code');
  });

  it('Python 三引号里的光标算字符串', () => {
    const text = 's = """\ninner value\n"""\nnext()';
    expect(classifyOffset(snap(text), text.indexOf('inner'), PY)).toBe('string');
    expect(classifyOffset(snap(text), text.indexOf('next'), PY)).toBe('code');
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

  it('目标在多行参数列表内部时收尾在整条语句之后', () => {
    // 旧实现在 `payload,` 那一行当场收尾, 于是日志被插进参数列表里。
    const text = 'send(\n  payload,\n  headers\n);\nnext();';
    expect(anchorLine(text, 'payload', JS)).toBe(3);
  });

  it('目标在多行对象字面量内部时收尾在字面量之后', () => {
    const text = 'const o = {\n  name: value,\n};\nnext();';
    expect(anchorLine(text, 'value', JS)).toBe(2);
  });

  it('运算符留在行尾的续行继续向下', () => {
    const text = 'const ok = first &&\n  second;\nnext();';
    expect(anchorLine(text, 'first', JS)).toBe(1);
  });

  it('运算符放在行首的三元续行也继续向下', () => {
    // 上一行行尾是 `cond`, 没有任何符号可查, 只能靠下一行行首的 `?` 与 `:`。
    const text = 'const v = cond\n  ? a\n  : b;\nnext();';
    expect(anchorLine(text, 'cond', JS)).toBe(2);
  });

  it('方法链的点号在行首时继续向下', () => {
    const text = 'const v = source\n  .filter(Boolean)\n  .join();\nnext();';
    expect(anchorLine(text, 'source', JS)).toBe(2);
  });
});

describe('locateAnchor 块内插入', () => {
  /** 返回锚点行号与缩进, 用来同时断言位置与对齐。 */
  function anchorOf(text: string, needle: string, config: ScanConfig, indentUnit = '  ') {
    const snapshot = snap(text, 'typescript', '\n', indentUnit);
    const target = resolveSelection(snapshot, caretIn(text, needle), '');
    if (target.kind === 'unsupported') throw new Error(`预期解析成功, 实际 ${target.code}`);
    const anchor = locateAnchor(snapshot, target, config);
    if (anchor.kind === 'unsupported') throw new Error(`预期定位成功, 实际 ${anchor.code}`);
    return anchor;
  }

  it('函数签名的日志落在函数体第一行, 缩进照抄体内现有行', () => {
    const anchor = anchorOf('function f(input) {\n\treturn input;\n}\n', 'input', JS);
    expect(anchor.line).toBe(0);
    expect(anchor.indent).toBe('\t');
    expect(anchor.placement).toBe('after-line');
  });

  it('条件头的日志落在块内', () => {
    const anchor = anchorOf('if (ready) {\n    run();\n}\n', 'ready', JS);
    expect(anchor.line).toBe(0);
    expect(anchor.indent).toBe('    ');
  });

  it('箭头函数体的日志落在回调体内, 而不是被推到 }); 之外', () => {
    // 这个块开在未闭合的括号里, 按"外层括号必须闭合"会跑到回调之外, 而参数在那里不在作用域内。
    const anchor = anchorOf('list.map(item => {\n  return item;\n});\n', 'item', JS);
    expect(anchor.line).toBe(0);
    expect(anchor.indent).toBe('  ');
  });

  it('类里的方法签名落在方法体内, 而不是插进 class body', () => {
    const anchor = anchorOf('class A {\n\trun(arg) {\n\t\treturn arg;\n\t}\n}\n', 'arg', JS);
    expect(anchor.line).toBe(1);
    expect(anchor.indent).toBe('\t\t');
  });

  it('Allman 风格的花括号也算块', () => {
    const anchor = anchorOf('if (ready)\n{\n  run();\n}\n', 'ready', JS);
    expect(anchor.line).toBe(1);
    expect(anchor.indent).toBe('  ');
  });

  it('空块回退到块头缩进加一级', () => {
    expect(anchorOf('  function f(a) {\n  }\n', 'a', JS).indent).toBe('    ');
    expect(anchorOf('  function f(a) {\n  }\n', 'a', JS, '\t').indent).toBe('  \t');
  });

  it('块内的普通语句仍然跟随目标行缩进', () => {
    const anchor = anchorOf('function f() {\n  const a = 1;\n}\n', 'const a', JS);
    expect(anchor.line).toBe(1);
    expect(anchor.indent).toBe('  ');
  });

  it('不能容纳语句的块头改为插到该语句之前', () => {
    const restricted: ScanConfig = { ...JS, restrictedBlockKeywords: ['switch', 'class'] };

    const sw = anchorOf('switch (kind) {\n  case 1:\n}\n', 'kind', restricted);
    expect(sw.line).toBe(0);
    expect(sw.placement).toBe('before-line');

    const cls = anchorOf('export class A {\n  run() {}\n}\n', 'class A', restricted);
    expect(cls.placement).toBe('before-line');
    expect(cls.line).toBe(0);
  });

  it('Allman 风格的受限块取关键字所在行, 而不是花括号所在行', () => {
    const restricted: ScanConfig = { ...JS, restrictedBlockKeywords: ['switch'] };
    const anchor = anchorOf('  switch (kind)\n  {\n    case 1:\n  }\n', 'kind', restricted);
    expect(anchor.line).toBe(0);
    expect(anchor.indent).toBe('  ');
    expect(anchor.placement).toBe('before-line');
  });

  it('属性名与受限关键字同名时不误判', () => {
    // `input.type` 里的 `type` 不是块关键字; 误判会让每个带 .type 的条件头都被推到语句之前。
    const restricted: ScanConfig = {
      ...JS,
      restrictedBlockKeywords: ['switch', 'class', 'interface', 'type'],
    };
    const anchor = anchorOf('if (input.type === "file") {\n\trun();\n}\n', '(input', restricted);
    expect(anchor.placement).toBe('after-line');
    expect(anchor.line).toBe(0);

    // `interface X {` 的花括号是块, 因此受限判定生效。
    expect(anchorOf('interface X {\n  a: number;\n}\n', 'interface X', restricted).placement).toBe(
      'before-line',
    );

    // `type X = {` 的花括号跟在 `=` 之后, 按字面量处理(D2 的保守退化), 日志落在整条语句之后。
    const literal = anchorOf('type X = {\n  a: 1,\n};\n', 'type X', restricted);
    expect(literal.placement).toBe('after-line');
    expect(literal.line).toBe(2);
  });

  it('未登记受限关键字的语言仍按块内插入', () => {
    const anchor = anchorOf('switch (kind) {\n  case 1:\n}\n', 'kind', JS);
    expect(anchor.placement).toBe('after-line');
  });

  it('对象字面量不被当成块', () => {
    const anchor = anchorOf('const o = {\n  name: 1,\n};\n', 'const o', JS);
    expect(anchor.line).toBe(2);
    expect(anchor.indent).toBe('');
  });
});

describe('locateAnchor 非花括号语言的块', () => {
  const PY_BLOCK: ScanConfig = { ...PY, blockStyle: 'colon-indent', restrictedBlockKeywords: ['match'] };
  const RB: ScanConfig = {
    commentPrefix: '#',
    stringDelimiters: ['"', "'"],
    blockStyle: 'keyword',
    blockOpenKeywords: ['def', 'if', 'unless', 'while', 'case', 'do'],
    restrictedBlockKeywords: ['case'],
  };
  const LUA_BLOCK: ScanConfig = {
    commentPrefix: '--',
    blockComment: { open: '--[[', close: ']]' },
    stringDelimiters: ['"', "'"],
    blockStyle: 'keyword',
    blockOpenKeywords: ['function', 'if', 'for', 'while', 'repeat', 'do'],
  };
  const EX: ScanConfig = {
    commentPrefix: '#',
    stringDelimiters: ['"'],
    blockStyle: 'keyword',
    blockOpenKeywords: ['def', 'defmodule', 'if', 'case'],
    restrictedBlockKeywords: ['case'],
  };

  function anchorOf(text: string, needle: string, config: ScanConfig, languageId = 'python') {
    const snapshot = snap(text, languageId);
    const target = resolveSelection(snapshot, caretIn(text, needle), '');
    if (target.kind === 'unsupported') throw new Error(`预期解析成功, 实际 ${target.code}`);
    const anchor = locateAnchor(snapshot, target, config);
    if (anchor.kind === 'unsupported') throw new Error(`预期定位成功, 实际 ${anchor.code}`);
    return anchor;
  }

  it('Python 的 def 块: 日志落在块内且缩进与块内现有行一致', () => {
    // 缩进为 0 会直接产生 IndentationError, 文件跑不起来, 所以这一条是硬性要求。
    const anchor = anchorOf('def f(value):\n    return value\n', 'value', PY_BLOCK);
    expect(anchor.line).toBe(0);
    expect(anchor.indent).toBe('    ');
  });

  it('Python 的多行签名以 ): 收尾, 同样算块', () => {
    const anchor = anchorOf('def f(\n    value\n):\n    return value\n', 'value', PY_BLOCK);
    expect(anchor.line).toBe(2);
    expect(anchor.indent).toBe('    ');
  });

  it('Python 的 match 是受限块, 日志插到语句之前', () => {
    const anchor = anchorOf('match kind:\n    case 1:\n        run()\n', 'kind', PY_BLOCK);
    expect(anchor.placement).toBe('before-line');
    expect(anchor.line).toBe(0);
  });

  it('Ruby 的 if 与带参 do 块都算块', () => {
    expect(anchorOf('if ready\n  run\nend\n', 'ready', RB, 'ruby').indent).toBe('  ');
    const each = anchorOf('items.each do |item|\n  use(item)\nend\n', 'item', RB, 'ruby');
    expect(each.line).toBe(0);
    expect(each.indent).toBe('  ');
  });

  it('Ruby 的修饰符写法与 endless method 不算块', () => {
    expect(anchorOf('run if ready\nnext_call\n', 'ready', RB, 'ruby').indent).toBe('');
    expect(anchorOf('def f(v) = v\nnext_call\n', 'v) = v', RB, 'ruby').placement).toBe('after-line');
  });

  it('Lua 的 function 块算块', () => {
    const anchor = anchorOf('function f(value)\n\treturn value\nend\n', 'value', LUA_BLOCK, 'lua');
    expect(anchor.line).toBe(0);
    expect(anchor.indent).toBe('\t');
  });

  it('Elixir 的 do 块算块, 但 , do: 单行写法不算', () => {
    const block = anchorOf('def f(value) do\n\tvalue\nend\n', 'value', EX, 'elixir');
    expect(block.indent).toBe('\t');
    const inline = anchorOf('def f(value), do: value\nnext_call\n', 'value), do', EX, 'elixir');
    expect(inline.placement).toBe('after-line');
    expect(inline.indent).toBe('');
  });
});

describe('locateAnchor 缩进与兜底', () => {
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
