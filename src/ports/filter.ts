import { sep } from 'node:path';

import type { BlockedReason, Origin, ProcessEntry } from './types';

/**
 * 来源归属判定, 系统项过滤, 搜索与排序 —— 全部是纯函数, 参数由调用方从配置与
 * workspace 里读好传入, 因此这一层不 import `vscode`。
 */

/**
 * 系统可执行文件所在的目录前缀。
 *
 * 刻意用"路径前缀 + 端口阈值"两条规则, 而不是维护上百条进程名与端口号的名单:
 * 名单会持续腐化, 而这两条规则不需要跟着系统版本更新。
 */
const SYSTEM_PATH_PREFIXES = [
  '/System/',
  '/usr/libexec/',
  '/usr/sbin/',
  '/sbin/',
  '/usr/lib/',
  'C:\\Windows\\',
];

/**
 * 从完整命令行里取出可执行文件路径。
 *
 * Windows 上含空格的路径必定被引号包起来, 所以先看引号; 否则取第一个空格之前的部分。
 */
export function extractExecutablePath(command: string): string {
  const trimmed = command.trim();
  if (trimmed.startsWith('"')) {
    const closing = trimmed.indexOf('"', 1);
    if (closing !== -1) return trimmed.slice(1, closing);
  }
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

/**
 * `child` 是否位于 `parent` 之下 (含相等)。
 *
 * 按路径分段比较而不是字符串前缀: `/repo/web` 不应命中 `/repo/webhook`。
 */
function isInside(child: string, parent: string): boolean {
  if (parent === '') return false;
  const split = (path: string) => path.split(/[/\\]/).filter((segment) => segment !== '');
  const parentSegments = split(parent);
  const childSegments = split(child);
  if (childSegments.length < parentSegments.length) return false;
  return parentSegments.every((segment, index) => segment === childSegments[index]);
}

/** 可执行文件位于系统目录, 或全部监听端口都在系统端口范围内。 */
export function isSystemProcess(entry: ProcessEntry, systemPortMax: number): boolean {
  const executable = extractExecutablePath(entry.command);
  if (SYSTEM_PATH_PREFIXES.some((prefix) => executable.startsWith(prefix))) return true;

  // 只要有一个端口超出阈值就不算系统项 —— 否则占着 8080 的系统进程会被静默藏掉。
  return (
    entry.listeners.length > 0 && entry.listeners.every((listener) => listener.port <= systemPortMax)
  );
}

/**
 * 判定归属。
 *
 * `workspace` 需要工作目录落在某个 workspace folder 之下 —— dev server 的 cwd 常常是
 * monorepo 的子包目录, 所以是"之下"而不是"相等"。
 */
export function classifyOrigin(
  entry: ProcessEntry,
  workspaceFolders: string[],
  systemPortMax: number
): Origin {
  if (entry.cwd && workspaceFolders.some((folder) => isInside(entry.cwd as string, folder))) {
    return 'workspace';
  }
  return isSystemProcess(entry, systemPortMax) ? 'system' : 'other';
}

/** 搜索匹配进程名, 完整命令行, PID, 工作目录与任一端口号。 */
export function matchesSearch(entry: ProcessEntry, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === '') return true;

  const haystacks = [
    entry.name,
    entry.command,
    entry.cwd ?? '',
    entry.pid === null ? '' : String(entry.pid),
    ...entry.listeners.map((listener) => String(listener.port)),
  ];
  return haystacks.some((value) => value.toLowerCase().includes(needle));
}

/** 本工作区优先 → 最小监听端口升序 → PID 升序。 */
export function sortEntries(entries: ProcessEntry[]): ProcessEntry[] {
  const rank = (entry: ProcessEntry) => (entry.origin === 'workspace' ? 0 : 1);
  const lowestPort = (entry: ProcessEntry) =>
    entry.listeners.length === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.min(...entry.listeners.map((listener) => listener.port));

  return [...entries].sort(
    (a, b) =>
      rank(a) - rank(b) || lowestPort(a) - lowestPort(b) || (a.pid ?? 0) - (b.pid ?? 0)
  );
}

/**
 * 标注可终止性。
 *
 * 三个原因互斥且有优先级: 拿不到 PID 就无从终止; 受保护的祖先进程绝不可终止 (优先于
 * "其他用户", 因为编辑器可能以另一个用户身份运行); 其他用户的进程需要提权, 扩展做不到。
 */
export function annotateKillability(
  entries: ProcessEntry[],
  protectedPids: ReadonlySet<number>,
  currentUser: string
): ProcessEntry[] {
  return entries.map((entry) => {
    let blockedReason: BlockedReason | undefined;

    if (entry.pid === null) blockedReason = 'unknown-pid';
    else if (protectedPids.has(entry.pid)) blockedReason = 'protected-ancestor';
    else if (currentUser !== '' && entry.user !== '' && entry.user !== currentUser) {
      blockedReason = 'other-user';
    }

    return blockedReason
      ? { ...entry, killable: false, blockedReason }
      : { ...entry, killable: true, blockedReason: undefined };
  });
}

export interface FilterOptions {
  workspaceFolders: string[];
  hideSystemProcesses: boolean;
  systemPortMax: number;
  search: string;
}

/** 归属判定 → 系统项过滤 → 搜索过滤 → 排序。 */
export function applyFilters(entries: ProcessEntry[], options: FilterOptions): ProcessEntry[] {
  const classified = entries.map((entry) => ({
    ...entry,
    origin: classifyOrigin(entry, options.workspaceFolders, options.systemPortMax),
  }));

  const visible = classified.filter((entry) => {
    if (options.hideSystemProcesses && entry.origin === 'system') return false;
    return matchesSearch(entry, options.search);
  });

  return sortEntries(visible);
}

/** 供视图展示工作目录时把 home 前缀缩成 `~`; 与过滤逻辑无关, 但同属路径处理。 */
export function shortenPath(path: string, home: string): string {
  return home !== '' && isInside(path, home) ? `~${sep}${path.slice(home.length + 1)}` : path;
}
