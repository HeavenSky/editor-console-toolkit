import { describe, expect, it } from 'vitest';

import { collectAncestors, parsePpid } from '../../src/ports/protect';
import type { RunCommand } from '../../src/ports/types';

/** 用一张 pid → ppid 表冒充 `ps`, 不碰真实进程。 */
function chainRun(chain: Record<number, number>): { run: RunCommand; calls: string[] } {
  const calls: string[] = [];
  const run: RunCommand = async (_file, args) => {
    const pid = Number(args[args.length - 1]);
    calls.push(String(pid));
    const ppid = chain[pid];
    if (ppid === undefined) throw new Error(`no such process: ${pid}`);
    return { stdout: `  ${ppid}\n`, stderr: '', code: 0 };
  };
  return { run, calls };
}

describe('parsePpid', () => {
  it('取输出里的第一个整数, 容忍前后空白', () => {
    expect(parsePpid('  27948\n')).toBe(27948);
  });

  it('拿不到数字时返回 null', () => {
    expect(parsePpid('')).toBeNull();
    expect(parsePpid('\n')).toBeNull();
  });

  it('ppid 为 0 视为无效', () => {
    expect(parsePpid('0')).toBeNull();
  });
});

describe('collectAncestors', () => {
  it('上溯到 init 之下的全部祖先, 含自身', async () => {
    // 28187(扩展宿主) → 27948(Code Helper) → 900(Code 主进程) → 1(init)
    const { run } = chainRun({ 28187: 27948, 27948: 900, 900: 1 });
    const ancestors = await collectAncestors(28187, run, 'darwin');
    expect([...ancestors].sort((a, b) => a - b)).toEqual([900, 27948, 28187]);
  });

  it('不把 init (1) 收进保护名单', async () => {
    const { run } = chainRun({ 5: 1 });
    expect(await collectAncestors(5, run, 'darwin')).toEqual(new Set([5]));
  });

  it('成环的链不导致死循环', async () => {
    const { run, calls } = chainRun({ 10: 11, 11: 10 });
    const ancestors = await collectAncestors(10, run, 'darwin');
    expect(ancestors).toEqual(new Set([10, 11]));
    // 走到已见过的 pid 就停, 不会一直查下去。
    expect(calls.length).toBeLessThan(5);
  });

  it('中途取不到父进程时返回已收集部分', async () => {
    const { run } = chainRun({ 20: 21 });
    expect(await collectAncestors(20, run, 'darwin')).toEqual(new Set([20, 21]));
  });

  it('首次查询就失败时至少保护自身', async () => {
    const run: RunCommand = async () => {
      throw new Error('ps unavailable');
    };
    expect(await collectAncestors(99, run, 'darwin')).toEqual(new Set([99]));
  });

  it('深度有上限, 极长的链不会无限上溯', async () => {
    // 构造一条 100 层的链, 只应查到 MAX_DEPTH 层。
    const chain: Record<number, number> = {};
    for (let pid = 1000; pid < 1100; pid += 1) chain[pid] = pid + 1;
    const { run, calls } = chainRun(chain);
    await collectAncestors(1000, run, 'darwin');
    expect(calls.length).toBeLessThanOrEqual(16);
  });

  it('Windows 走 PowerShell 而不是 ps', async () => {
    const seen: string[] = [];
    const run: RunCommand = async (file, args) => {
      seen.push(file);
      return { stdout: args.join(' ').includes('ProcessId=7') ? '1' : '', stderr: '', code: 0 };
    };
    await collectAncestors(7, run, 'win32');
    expect(seen).toEqual(['powershell.exe']);
  });
});
