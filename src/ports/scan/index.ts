import type { ProcessEntry, RunCommand, ScanOptions, ScanResult } from '../types';
import { mergeListeners } from './address';
import { scanDarwin } from './darwin';
import { runCommand } from './exec';
import { scanLinux } from './linux';
import { scanWin32 } from './win32';

/**
 * 按平台派发并聚合。
 *
 * 失败一律转成带原因的 `ScanResult.error` 而不是抛出: 视图每几秒刷新一次, 抛异常会让
 * 上层要么静默吞掉要么反复弹通知, 两者都不可接受。
 */

/**
 * 按 pid 聚合。
 *
 * 平台扫描器已经各自做了一遍归并, 这里再做一次是因为聚合规则只应有一处权威实现;
 * pid 为 null 的条目 (Linux 非 root) 无法归并, 各自保留成行。
 */
export function aggregate(entries: ProcessEntry[]): ProcessEntry[] {
  const byPid = new Map<number, ProcessEntry>();
  const unknown: ProcessEntry[] = [];

  for (const entry of entries) {
    if (entry.pid === null) {
      unknown.push(entry);
      continue;
    }
    const existing = byPid.get(entry.pid);
    if (!existing) {
      byPid.set(entry.pid, { ...entry, listeners: [...entry.listeners] });
      continue;
    }
    existing.listeners.push(...entry.listeners);
    // 同一 pid 的多条记录里, 信息更全的那条胜出。
    if (!existing.cwd && entry.cwd) existing.cwd = entry.cwd;
    if (!existing.command && entry.command) existing.command = entry.command;
  }

  const merged = [...byPid.values(), ...unknown];
  for (const entry of merged) entry.listeners = mergeListeners(entry.listeners);
  return merged;
}

export async function scanPorts(
  options: ScanOptions,
  run: RunCommand = runCommand,
  platform: NodeJS.Platform = process.platform
): Promise<ScanResult> {
  try {
    switch (platform) {
      case 'darwin':
        return { entries: aggregate(await scanDarwin(run, options)) };
      case 'linux':
        return { entries: aggregate(await scanLinux(run, options)) };
      case 'win32':
        return { entries: aggregate(await scanWin32(run, options)) };
      default:
        return { entries: [], error: `Port scanning is not supported on ${platform}.` };
    }
  } catch (error) {
    return { entries: [], error: error instanceof Error ? error.message : String(error) };
  }
}
