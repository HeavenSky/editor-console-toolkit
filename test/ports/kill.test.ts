import { describe, expect, it } from 'vitest';

import { killProcesses, summarizeOutcomes } from '../../src/ports/kill';
import type { KillDeps, KillReport, KillTarget } from '../../src/ports/kill';
import type { RunCommand } from '../../src/ports/types';

/**
 * 全程使用注入的假接缝与假时钟, **不真实终止任何进程**, 也不真的等待。
 */

const target = (over: Partial<KillTarget> = {}): KillTarget => ({
  pid: 41802,
  expectedCommand: 'node vite --host',
  name: 'node',
  ...over,
});

interface Harness {
  deps: KillDeps;
  signals: Array<{ pid: number; signal: NodeJS.Signals | 0 }>;
  commands: Array<{ file: string; args: string[] }>;
  waited: number[];
}

/**
 * @param alive 进程在收到第 N 次信号后是否仍存活; `dieAfter` 表示第几次 SIGTERM/SIGKILL 之后消失,
 *              `Infinity` 表示怎么都不死。
 */
function harness(options: {
  currentCommand?: string | null;
  dieAfter?: number;
  platform?: NodeJS.Platform;
  signalThrows?: boolean;
}): Harness {
  const signals: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = [];
  const commands: Array<{ file: string; args: string[] }> = [];
  const waited: number[] = [];
  let realSignalCount = 0;

  const run: RunCommand = async (file, args) => {
    commands.push({ file, args });
    if (file === 'ps' || file === 'powershell.exe') {
      const command = options.currentCommand === undefined ? 'node vite --host' : options.currentCommand;
      return { stdout: command === null ? '' : `${command}\n`, stderr: '', code: 0 };
    }
    if (file === 'taskkill') realSignalCount += 1;
    return { stdout: '', stderr: '', code: 0 };
  };

  const deps: KillDeps = {
    run,
    sendSignal: (pid, signal) => {
      if (signal === 0) {
        // 存活探测: 发够了信号之后就认为进程已消失。
        if (realSignalCount >= (options.dieAfter ?? 1)) throw new Error('ESRCH');
        return;
      }
      signals.push({ pid, signal });
      if (options.signalThrows) throw new Error('EPERM');
      realSignalCount += 1;
    },
    wait: async (ms) => {
      waited.push(ms);
    },
    platform: options.platform ?? 'darwin',
    killTimeout: 1000,
  };

  return { deps, signals, commands, waited };
}

describe('killProcesses 的 PID 复用校验', () => {
  it('命令行不一致时不发出任何信号', async () => {
    const h = harness({ currentCommand: 'node other-thing.js' });
    const [report] = await killProcesses([target()], h.deps);

    expect(report.outcome).toBe('skipped-changed');
    expect(h.signals).toEqual([]);
    expect(h.commands.every((call) => call.file === 'ps')).toBe(true);
  });

  it('把实际命令行放进 detail 供上层展示', async () => {
    const h = harness({ currentCommand: 'node other-thing.js' });
    const [report] = await killProcesses([target()], h.deps);
    expect(report.detail).toBe('node other-thing.js');
  });

  it('进程已经不存在时视为已终止, 不发信号', async () => {
    const h = harness({ currentCommand: null });
    const [report] = await killProcesses([target()], h.deps);
    expect(report.outcome).toBe('terminated');
    expect(h.signals).toEqual([]);
  });
});

describe('killProcesses 的升级策略', () => {
  it('SIGTERM 后立即消失的进程不会收到 SIGKILL', async () => {
    const h = harness({ dieAfter: 1 });
    const [report] = await killProcesses([target()], h.deps);

    expect(report.outcome).toBe('terminated');
    expect(h.signals.map((item) => item.signal)).toEqual(['SIGTERM']);
  });

  it('SIGTERM 无效时升级到 SIGKILL', async () => {
    const h = harness({ dieAfter: 2 });
    const [report] = await killProcesses([target()], h.deps);

    expect(report.outcome).toBe('killed');
    expect(h.signals.map((item) => item.signal)).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('SIGKILL 也无效时报 failed', async () => {
    const h = harness({ dieAfter: Number.POSITIVE_INFINITY });
    const [report] = await killProcesses([target()], h.deps);

    expect(report.outcome).toBe('failed');
    expect(report.detail).toBe('process survived SIGKILL');
  });

  it('等待期间按固定间隔轮询, 不超过 killTimeout', async () => {
    const h = harness({ dieAfter: Number.POSITIVE_INFINITY });
    await killProcesses([target()], h.deps);

    expect(h.waited.every((ms) => ms === 200)).toBe(true);
    // killTimeout 1000ms / 200ms = 5 次轮询, SIGTERM 与 SIGKILL 各一轮。
    expect(h.waited).toHaveLength(10);
  });

  it('发信号本身失败时报 failed 并带上原因', async () => {
    const h = harness({ signalThrows: true });
    const [report] = await killProcesses([target()], h.deps);

    expect(report.outcome).toBe('failed');
    expect(report.detail).toContain('EPERM');
  });
});

describe('killProcesses 在 Windows 上', () => {
  it('先 taskkill 再 taskkill /F, 且不加 /T', async () => {
    const h = harness({ dieAfter: 2, platform: 'win32' });
    const [report] = await killProcesses([target()], h.deps);

    const taskkills = h.commands.filter((call) => call.file === 'taskkill');
    expect(report.outcome).toBe('killed');
    expect(taskkills[0].args).toEqual(['/PID', '41802']);
    expect(taskkills[1].args).toEqual(['/F', '/PID', '41802']);
    expect(taskkills.some((call) => call.args.includes('/T'))).toBe(false);
  });

  it('用 PowerShell 而不是 ps 读命令行', async () => {
    const h = harness({ dieAfter: 1, platform: 'win32' });
    await killProcesses([target()], h.deps);
    expect(h.commands[0].file).toBe('powershell.exe');
  });
});

describe('killProcesses 批量', () => {
  it('逐项返回结果, 一项失败不影响其余', async () => {
    const h = harness({ dieAfter: 1 });
    const reports = await killProcesses(
      [target({ pid: 1 }), target({ pid: 2 }), target({ pid: 3 })],
      h.deps
    );
    expect(reports).toHaveLength(3);
    expect(reports.map((report) => report.target.pid)).toEqual([1, 2, 3]);
  });

  it('空目标列表返回空结果, 不发任何命令', async () => {
    const h = harness({});
    expect(await killProcesses([], h.deps)).toEqual([]);
    expect(h.commands).toEqual([]);
  });
});

describe('summarizeOutcomes', () => {
  const report = (outcome: KillReport['outcome'], pid: number): KillReport => ({
    target: target({ pid }),
    outcome,
  });

  it('四类计数正确', () => {
    const summary = summarizeOutcomes([
      report('terminated', 1),
      report('terminated', 2),
      report('killed', 3),
      report('skipped-changed', 4),
      report('failed', 5),
    ]);
    expect(summary).toMatchObject({ terminated: 2, killed: 1, skipped: 1, failed: 1 });
  });

  it('只把跳过与失败的条目放进 problems', () => {
    const summary = summarizeOutcomes([
      report('terminated', 1),
      report('skipped-changed', 4),
      report('failed', 5),
    ]);
    expect(summary.problems.map((item) => item.target.pid)).toEqual([4, 5]);
  });

  it('空输入得到全零', () => {
    expect(summarizeOutcomes([])).toEqual({
      terminated: 0,
      killed: 0,
      skipped: 0,
      failed: 0,
      problems: [],
    });
  });
});
