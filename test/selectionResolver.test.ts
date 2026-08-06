import { describe, expect, it } from 'vitest';

import { resolveSelection } from '../src/core/selectionResolver';

import { caretIn, select, snap } from './helpers';

/** 便于断言的薄封装: 只关心解析出的表达式。 */
function expr(text: string, selection: ReturnType<typeof caretIn>, identifierExtra = ''): string {
  const target = resolveSelection(snap(text), selection, identifierExtra);
  if (target.kind === 'unsupported') throw new Error(`预期解析成功, 实际是 ${target.code}`);
  return target.expression;
}

function reason(text: string, selection: ReturnType<typeof caretIn>, identifierExtra = ''): string {
  const target = resolveSelection(snap(text), selection, identifierExtra);
  if (target.kind !== 'unsupported') throw new Error(`预期失败, 实际解析出 ${target.expression}`);
  return target.code;
}

describe('resolveSelection 空选择', () => {
  it('以光标为中心向两侧扩展出标识符', () => {
    const text = 'const user = 1;';
    expect(expr(text, caretIn(text, 'us'))).toBe('user');
  });

  it('向左吸收 .ident 属性链', () => {
    const text = 'const x = user.profile.name;';
    expect(expr(text, caretIn(text, 'name'))).toBe('user.profile.name');
  });

  it('只向左吸收: 光标停在链首时只得到链首', () => {
    const text = 'const x = user.profile.name;';
    expect(expr(text, caretIn(text, 'user'))).toBe('user');
  });

  it('不跨行吸收', () => {
    const text = 'const a = obj\n  .value;';
    // 光标在第二行的 value 上, 行首的 `.` 之前没有同行标识符, 因此不吸收。
    expect(expr(text, caretIn(text, 'value'))).toBe('value');
  });

  it('identifierExtra 把 $ 并入标识符字符集 (PHP)', () => {
    const text = 'var_dump($user);';
    expect(expr(text, caretIn(text, 'user'), '$')).toBe('$user');
    expect(expr(text, caretIn(text, 'user'))).toBe('user');
  });

  it('光标不在标识符上时报 empty-target', () => {
    const text = 'const a = 1;   ';
    expect(reason(text, { anchor: 14, active: 14 })).toBe('empty-target');
  });
});

describe('resolveSelection 显式选择', () => {
  it('原样使用选中的代码', () => {
    const text = 'const x = a + b * 2;';
    expect(expr(text, select(text, 'a + b * 2'))).toBe('a + b * 2');
  });

  it('两端空白被 trim', () => {
    const text = 'const x =   a + b  ;';
    expect(expr(text, select(text, '  a + b  '))).toBe('a + b');
  });

  it('反向选择 (anchor 大于 active) 结果相同', () => {
    const text = 'const x = a + b;';
    const forward = select(text, 'a + b');
    expect(expr(text, { anchor: forward.active, active: forward.anchor })).toBe('a + b');
  });

  it('跨行选择报 multiline-selection', () => {
    const text = 'const a = 1;\nconst b = 2;';
    expect(reason(text, { anchor: 0, active: text.length })).toBe('multiline-selection');
  });

  it('全空白选择报 empty-target', () => {
    const text = 'const x =    1;';
    expect(reason(text, select(text, '    '))).toBe('empty-target');
  });

  it('label 折叠连续空白, expression 保留原样', () => {
    const text = 'const x = a  +   b;';
    const target = resolveSelection(snap(text), select(text, 'a  +   b'), '');
    if (target.kind === 'unsupported') throw new Error('预期解析成功');
    expect(target.expression).toBe('a  +   b');
    expect(target.label).toBe('a + b');
  });
});
