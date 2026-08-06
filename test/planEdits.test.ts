import { describe, expect, it } from 'vitest';

import { planEdits, planToggleAllLogs } from '../src/core/planEdits';
import { javascriptAdapter } from '../src/languages/adapters/javascript';
import { pythonAdapter } from '../src/languages/adapters/python';

import { apply, caretIn, snap } from './helpers';

const PREFIX = '[D]';
const js = javascriptAdapter;

describe('planEdits insert', () => {
  it('在锚点行的下一行插入带标记的日志, 缩进跟随目标行', () => {
    const text = '  const user = 1;\n  next();\n';
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'user')], 'insert');
    expect(apply(text, plan)).toBe(
      "  const user = 1;\n  console.log('[D] user:', user); // ect:v1\n  next();\n",
    );
  });

  it('prefix 为空时不留前导空格', () => {
    const text = 'const user = 1;\n';
    const plan = planEdits(snap(text), js, '', [caretIn(text, 'user')], 'insert');
    expect(apply(text, plan)).toContain("console.log('user:', user);");
  });

  it('已存在完全相同的日志时跳过, 不产生编辑', () => {
    const text = "const user = 1;\nconsole.log('[D] user:', user); // ect:v1\n";
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'user')], 'insert');
    expect(plan.edits).toEqual([]);
    expect(plan.firstReason).toBeNull();
  });

  it('下一行的日志内容不同时仍然插入', () => {
    const text = "const user = 1;\nconsole.log('[D] other:', other); // ect:v1\n";
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'user')], 'insert');
    expect(plan.edits).toHaveLength(1);
  });

  it('多个选区落在同一锚点时只插一条', () => {
    const text = 'const user = 1;\n';
    const selections = [caretIn(text, 'us'), caretIn(text, 'user')];
    const plan = planEdits(snap(text), js, PREFIX, selections, 'insert');
    expect(plan.edits).toHaveLength(1);
  });

  it('多个选区分别落在不同锚点时各插一条', () => {
    const text = 'const a = 1;\nconst b = 2;\n';
    const plan = planEdits(
      snap(text),
      js,
      PREFIX,
      [caretIn(text, 'const a'), caretIn(text, 'const b')],
      'insert',
    );
    expect(plan.edits).toHaveLength(2);
    expect(apply(text, plan)).toBe(
      "const a = 1;\nconsole.log('[D] a:', a); // ect:v1\n" +
        "const b = 2;\nconsole.log('[D] b:', b); // ect:v1\n",
    );
  });

  it('解析失败时记录首个原因且不产生编辑', () => {
    const text = '// const user = 1;\n';
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'user')], 'insert');
    expect(plan.edits).toEqual([]);
    expect(plan.firstReason).toBe('cursor-in-comment');
  });

  it('使用文档的 eol 作为新行的换行符', () => {
    const text = 'const user = 1;\r\n';
    const plan = planEdits(snap(text, 'typescript', '\r\n'), js, PREFIX, [caretIn(text, 'user')], 'insert');
    expect(plan.edits[0]).toMatchObject({ kind: 'insert' });
    expect(plan.edits[0]).toHaveProperty('text', expect.stringContaining('\r\n'));
  });
});

describe('planEdits toggle', () => {
  it('光标在日志行上直接删掉该行', () => {
    const text = "const user = 1;\nconsole.log('[D] user:', user); // ect:v1\nnext();\n";
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, "'[D] user")], 'toggle');
    expect(apply(text, plan)).toBe('const user = 1;\nnext();\n');
  });

  it('锚点下一行是日志时删掉它', () => {
    const text = "const user = 1;\nconsole.log('[D] user:', user); // ect:v1\n";
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'const user')], 'toggle');
    expect(apply(text, plan)).toBe('const user = 1;\n');
  });

  it('下一行不是日志时插入', () => {
    const text = 'const user = 1;\n';
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'user')], 'toggle');
    expect(apply(text, plan)).toBe("const user = 1;\nconsole.log('[D] user:', user); // ect:v1\n");
  });

  it('内容不同的日志也被删除 (toggle 只看标记, 不比内容)', () => {
    const text = "const user = 1;\nconsole.log('OLD user:', user); // ect:v1\n";
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'const user')], 'toggle');
    expect(apply(text, plan)).toBe('const user = 1;\n');
  });

  it('删除末行日志时吃掉它前面的换行符, 不留空行', () => {
    const text = "const user = 1;\nconsole.log('[D] user:', user); // ect:v1";
    const plan = planEdits(snap(text), js, PREFIX, [caretIn(text, 'const user')], 'toggle');
    expect(apply(text, plan)).toBe('const user = 1;');
  });

  it('同一行被多个选区命中时只删一次', () => {
    const text = "const a = 1;\nconsole.log('[D] a:', a); // ect:v1\n";
    const logLine = text.indexOf('console.log');
    const selections = [
      { anchor: logLine, active: logLine },
      { anchor: logLine + 3, active: logLine + 3 },
    ];
    const plan = planEdits(snap(text), js, PREFIX, selections, 'toggle');
    expect(plan.edits).toHaveLength(1);
  });
});

describe('planToggleAllLogs', () => {
  const text =
    'const a = 1;\n' +
    "console.log('[D] a:', a); // ect:v1\n" +
    'const b = 2;\n' +
    "  console.log('[D] b:', b); // ect:v1\n";

  it('全部未注释时一次性注释掉全部, 缩进不变', () => {
    const plan = planToggleAllLogs(snap(text), js);
    expect(apply(text, plan)).toBe(
      'const a = 1;\n' +
        "// console.log('[D] a:', a); // ect:v1\n" +
        'const b = 2;\n' +
        "  // console.log('[D] b:', b); // ect:v1\n",
    );
  });

  it('全部已注释时全部恢复', () => {
    const commented = apply(text, planToggleAllLogs(snap(text), js));
    expect(apply(commented, planToggleAllLogs(snap(commented), js))).toBe(text);
  });

  it('混合状态一次收敛为全部注释', () => {
    const mixed =
      'const a = 1;\n' +
      "// console.log('[D] a:', a); // ect:v1\n" +
      'const b = 2;\n' +
      "console.log('[D] b:', b); // ect:v1\n";
    const plan = planToggleAllLogs(snap(mixed), js);
    expect(plan.edits).toHaveLength(1);
    expect(apply(mixed, plan)).toBe(
      'const a = 1;\n' +
        "// console.log('[D] a:', a); // ect:v1\n" +
        'const b = 2;\n' +
        "// console.log('[D] b:', b); // ect:v1\n",
    );
  });

  it('恢复时注释符后至多吃掉一个空格', () => {
    const noSpace = "const a = 1;\n//console.log('[D] a:', a); // ect:v1\n";
    expect(apply(noSpace, planToggleAllLogs(snap(noSpace), js))).toBe(
      "const a = 1;\nconsole.log('[D] a:', a); // ect:v1\n",
    );
  });

  it('文件里没有受管日志时报 no-managed-logs', () => {
    const plan = planToggleAllLogs(snap('const a = 1;\nconsole.log(a);\n'), js);
    expect(plan.edits).toEqual([]);
    expect(plan.firstReason).toBe('no-managed-logs');
  });

  it('注释符跟随语言 (Python 用 #)', () => {
    const py = "value = 1\nprint('[D] value:', value) # ect:v1\n";
    expect(apply(py, planToggleAllLogs(snap(py, 'python'), pythonAdapter))).toBe(
      "value = 1\n# print('[D] value:', value) # ect:v1\n",
    );
  });

  it('行尾标记在注释后仍然完整, 之后仍能被单条 toggle 识别', () => {
    const commented = apply(text, planToggleAllLogs(snap(text), js));
    const plan = planEdits(snap(commented), js, PREFIX, [caretIn(commented, 'const a')], 'toggle');
    expect(plan.edits).toHaveLength(1);
    expect(plan.edits[0]).toMatchObject({ kind: 'delete' });
  });
});
