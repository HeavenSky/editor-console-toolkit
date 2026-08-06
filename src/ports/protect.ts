import type { RunCommand } from './types';

/**
 * 编辑器自身的进程保护。
 *
 * 从扩展宿主进程 (`process.pid`) 沿父进程链一路上溯, 得到的祖先集合就是"绝不可终止"的
 * 名单 —— 里面必然包含编辑器主进程。刻意不按进程名匹配: 名单式判定对 VS Code, Cursor,
 * Windsurf 等各种衍生编辑器都要逐个维护, 而祖先链对所有衍生版天然成立。
 */

/** 防御成环或异常深的链; 正常情况下深度个位数。 */
const MAX_DEPTH = 16;

/**
 * 解析父进程 ID。
 *
 * POSIX 的 `ps -o ppid=` 与 Windows 的 PowerShell 都只输出一个数字, 所以同一个解析函数
 * 通用: 取输出里的第一个整数。
 */
export function parsePpid(stdout: string): number | null {
  const match = /(\d+)/.exec(stdout.trim());
  if (!match) return null;
  const ppid = Number(match[1]);
  return Number.isInteger(ppid) && ppid > 0 ? ppid : null;
}

/** 查询单个进程的父进程; Windows 没有 `ps`, 走 PowerShell。 */
function ppidCommand(pid: number, platform: NodeJS.Platform): [string, string[]] {
  if (platform === 'win32') {
    return [
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId`,
      ],
    ];
  }
  return ['ps', ['-o', 'ppid=', '-p', String(pid)]];
}

/**
 * 收集 `pid` 自身与它的全部祖先。
 *
 * 任何一步取不到父进程就停下并返回已收集到的部分 —— 保护名单短一点只是少保护几个进程,
 * 而抛错会让整个视图不可用。
 */
export async function collectAncestors(
  pid: number,
  run: RunCommand,
  platform: NodeJS.Platform = process.platform
): Promise<Set<number>> {
  const ancestors = new Set<number>([pid]);
  let current = pid;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    let ppid: number | null = null;
    try {
      const [file, args] = ppidCommand(current, platform);
      const { stdout } = await run(file, args);
      ppid = parsePpid(stdout);
    } catch {
      break;
    }

    // init (1) 之上没有可保护的东西; 已见过的 pid 说明链成环。
    if (ppid === null || ppid === 1 || ancestors.has(ppid)) break;
    ancestors.add(ppid);
    current = ppid;
  }

  return ancestors;
}
