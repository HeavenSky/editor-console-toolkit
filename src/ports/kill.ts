import type { RunCommand, SendSignal } from './types';

/**
 * 进程终止层。
 *
 * 策略是 SIGTERM → 等待 → SIGKILL, 而不是直接 SIGKILL: dev server 收到 SIGTERM 才有机会
 * 关闭 socket 与清掉临时文件。刻意**不终止进程树** (Windows 不加 `taskkill /T`), 因为
 * "勾了哪几行就杀哪几个进程"必须可预测。
 *
 * 发信号前一定重新校验命令行: 从用户勾选到点确认之间进程可能已经退出, 而 PID 会被系统
 * 复用 —— 不校验就有杀错进程的风险。
 */

/** 存活探测间隔; 与 `killTimeout` 一起决定升级到 SIGKILL 的时机。 */
const POLL_INTERVAL_MS = 200;

export interface KillTarget {
  pid: number;
  /** 勾选时记录的完整命令行, 用于发信号前的复用校验。 */
  expectedCommand: string;
  /** 仅用于结果展示。 */
  name: string;
}

export type KillOutcome =
  /** SIGTERM 后自行退出。 */
  | 'terminated'
  /** SIGTERM 无效, 被 SIGKILL 强制结束。 */
  | 'killed'
  /** 命令行与勾选时不一致, 未发出任何信号。 */
  | 'skipped-changed'
  /** 信号发出了但进程仍在, 或发信号本身失败。 */
  | 'failed';

export interface KillReport {
  target: KillTarget;
  outcome: KillOutcome;
  detail?: string;
}

export interface KillDeps {
  run: RunCommand;
  sendSignal: SendSignal;
  /** 注入以便测试用假时钟, 不真的等待。 */
  wait: (ms: number) => Promise<void>;
  platform: NodeJS.Platform;
  killTimeout: number;
}

const POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-Command'];

/** 读取进程当前的完整命令行; 进程已不存在时返回 null。 */
async function readCommand(
  pid: number,
  run: RunCommand,
  platform: NodeJS.Platform
): Promise<string | null> {
  try {
    if (platform === 'win32') {
      const script = `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`;
      const { stdout } = await run('powershell.exe', [...POWERSHELL_ARGS, script]);
      const command = stdout.trim();
      return command === '' ? null : command;
    }
    const { stdout } = await run('ps', ['-ww', '-o', 'args=', '-p', String(pid)]);
    const command = stdout.trim();
    return command === '' ? null : command;
  } catch {
    return null;
  }
}

/** `process.kill(pid, 0)` 不发信号, 只探测存活; 抛错即进程已不存在。 */
function isAlive(pid: number, sendSignal: SendSignal): boolean {
  try {
    sendSignal(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 等到进程消失或超时; 返回是否已消失。 */
async function waitForExit(
  pid: number,
  deps: Pick<KillDeps, 'sendSignal' | 'wait' | 'killTimeout'>
): Promise<boolean> {
  let waited = 0;
  while (waited < deps.killTimeout) {
    if (!isAlive(pid, deps.sendSignal)) return true;
    await deps.wait(POLL_INTERVAL_MS);
    waited += POLL_INTERVAL_MS;
  }
  return !isAlive(pid, deps.sendSignal);
}

async function killOne(target: KillTarget, deps: KillDeps): Promise<KillReport> {
  const actual = await readCommand(target.pid, deps.run, deps.platform);

  // 进程已经不在了 —— 目的已达成, 不必再发信号。
  if (actual === null) return { target, outcome: 'terminated' };

  if (actual !== target.expectedCommand) {
    return { target, outcome: 'skipped-changed', detail: actual };
  }

  try {
    if (deps.platform === 'win32') {
      await deps.run('taskkill', ['/PID', String(target.pid)]);
    } else {
      deps.sendSignal(target.pid, 'SIGTERM');
    }
  } catch (error) {
    return { target, outcome: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }

  if (await waitForExit(target.pid, deps)) return { target, outcome: 'terminated' };

  try {
    if (deps.platform === 'win32') {
      await deps.run('taskkill', ['/F', '/PID', String(target.pid)]);
    } else {
      deps.sendSignal(target.pid, 'SIGKILL');
    }
  } catch (error) {
    return { target, outcome: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }

  if (await waitForExit(target.pid, deps)) return { target, outcome: 'killed' };
  return { target, outcome: 'failed', detail: 'process survived SIGKILL' };
}

/**
 * 逐个终止。
 *
 * 刻意串行而不是并发: 每个目标都要先查命令行再发信号, 并发会让子进程调用数量在批量很大时
 * 突然放大, 而这里的耗时本来就由等待退出主导。
 */
export async function killProcesses(
  targets: KillTarget[],
  deps: KillDeps
): Promise<KillReport[]> {
  const reports: KillReport[] = [];
  for (const target of targets) reports.push(await killOne(target, deps));
  return reports;
}

export interface KillSummary {
  terminated: number;
  killed: number;
  skipped: number;
  failed: number;
  /** 未能终止或被跳过的条目, 供上层展示明细。 */
  problems: KillReport[];
}

export function summarizeOutcomes(reports: KillReport[]): KillSummary {
  const summary: KillSummary = { terminated: 0, killed: 0, skipped: 0, failed: 0, problems: [] };

  for (const report of reports) {
    switch (report.outcome) {
      case 'terminated':
        summary.terminated += 1;
        break;
      case 'killed':
        summary.killed += 1;
        break;
      case 'skipped-changed':
        summary.skipped += 1;
        summary.problems.push(report);
        break;
      case 'failed':
        summary.failed += 1;
        summary.problems.push(report);
        break;
    }
  }

  return summary;
}

/** 真实等待; 测试注入假实现。 */
export const realWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** 真实信号发送; 测试注入假实现。 */
export const realSendSignal: SendSignal = (pid, signal) => {
  process.kill(pid, signal);
};
