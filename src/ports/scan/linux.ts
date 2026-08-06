import type { Listener, ProcessEntry, RunCommand, ScanOptions } from '../types';
import { mergeListeners, parseEndpoint } from './address';

/**
 * Linux 采集: `ss` 优先, 失败回退 `netstat`。
 *
 * 两个刻意的选择:
 * - **逐协议分别调用** (`-tlnpH` 与 `-ulnpH`), 不用 `-tulpn`。TCP 与 UDP 的行列数不同,
 *   混在一次输出里按固定列号取值必然错位;
 * - `-H` 去掉表头, 不靠"跳过第一行"来处理表头。
 *
 * 非 root 时 `ss` 拿不到 `users:((...))`, 此时 **保留该条目** 并把 pid 记为 null:
 * 用户至少应当知道端口被占用了, 即使归属不明。
 */
const PID_CHUNK = 256;

interface RawListener {
  listener: Listener;
  pid: number | null;
  name: string;
}

/** 从 `users:(("nginx",pid=1234,fd=6))` 里取第一个进程的名字与 pid。 */
function parseUsers(text: string): { pid: number | null; name: string } {
  const pid = /pid=(\d+)/.exec(text);
  const name = /\("([^"]+)"/.exec(text);
  return {
    pid: pid ? Number(pid[1]) : null,
    name: name ? name[1] : '',
  };
}

/**
 * 解析 `ss -tlnpH` / `ss -ulnpH`。
 *
 * 列: State, Recv-Q, Send-Q, Local Address:Port, Peer Address:Port, [Process]
 * 进程列可能整个缺失 (非 root), 也可能因多进程共享而很长, 所以取第 6 列及其后的全部内容。
 */
export function parseSs(stdout: string, protocol: 'TCP' | 'UDP'): RawListener[] {
  const results: RawListener[] = [];

  for (const line of stdout.split('\n')) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5) continue;

    const endpoint = parseEndpoint(columns[3]);
    if (!endpoint) continue;

    const users = columns.slice(5).join(' ');
    results.push({ listener: { protocol, ...endpoint }, ...parseUsers(users) });
  }

  return results;
}

/**
 * 解析 `netstat -tlnp` / `netstat -ulnp`。
 *
 * UDP 的输出没有 State 列, 所以列号在两种协议下不一致; 这里不按列号取值, 而是
 * 从整行里匹配 `<pid>/<program>`, 它只会出现在最后的 PID/Program 列。
 */
export function parseNetstat(stdout: string, protocol: 'TCP' | 'UDP'): RawListener[] {
  const results: RawListener[] = [];

  for (const line of stdout.split('\n')) {
    if (!/^(tcp|udp)/i.test(line.trim())) continue;

    const columns = line.trim().split(/\s+/);
    const endpoint = parseEndpoint(columns[3] ?? '');
    if (!endpoint) continue;

    const owner = /(\d+)\/(\S+)\s*$/.exec(line);
    results.push({
      listener: { protocol, ...endpoint },
      pid: owner ? Number(owner[1]) : null,
      name: owner ? owner[2] : '',
    });
  }

  return results;
}

interface PsDetail {
  ppid: number | null;
  user: string;
  etime: string;
  command: string;
}

/**
 * 解析 `ps -ww -o pid=,ppid=,user=,etime=,args=`; 命令行含空格, 只切前四列。
 *
 * `ss` 不提供进程所属用户, 而"其他用户的进程不可终止"这条保护需要它, 所以从 `ps` 一起取。
 */
export function parsePsDetails(stdout: string): Map<number, PsDetail> {
  const details = new Map<number, PsDetail>();

  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    details.set(Number(match[1]), {
      ppid: Number(match[2]),
      user: match[3],
      etime: match[4],
      command: match[5],
    });
  }

  return details;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** 一个协议一次调用; `ss` 不可用时回退 `netstat`。 */
async function collect(
  run: RunCommand,
  protocol: 'TCP' | 'UDP'
): Promise<RawListener[]> {
  const ssFlag = protocol === 'TCP' ? '-tlnpH' : '-ulnpH';
  try {
    const { stdout } = await run('ss', [ssFlag]);
    return parseSs(stdout, protocol);
  } catch {
    const netstatFlag = protocol === 'TCP' ? '-tlnp' : '-ulnp';
    const { stdout } = await run('netstat', [netstatFlag]);
    return parseNetstat(stdout, protocol);
  }
}

export async function scanLinux(run: RunCommand, options: ScanOptions): Promise<ProcessEntry[]> {
  const raw = await collect(run, 'TCP');
  if (options.includeUdp) raw.push(...(await collect(run, 'UDP')));
  if (raw.length === 0) return [];

  const pids = [...new Set(raw.map((item) => item.pid).filter((pid): pid is number => pid !== null))];
  const details = new Map<number, PsDetail>();
  const cwds = new Map<number, string>();

  for (const group of chunk(pids, PID_CHUNK)) {
    const ps = await run('ps', ['-ww', '-o', 'pid=,ppid=,user=,etime=,args=', '-p', group.join(',')]);
    for (const [pid, detail] of parsePsDetails(ps.stdout)) details.set(pid, detail);

    // `readlink` 走同一个子进程接缝, 所以 src/ 里不需要 node:fs。
    for (const pid of group) {
      try {
        const { stdout } = await run('readlink', ['-f', `/proc/${pid}/cwd`]);
        const path = stdout.trim();
        if (path !== '') cwds.set(pid, path);
      } catch {
        // 进程已退出或无权限读取, 工作目录留空即可, 不影响其余字段。
      }
    }
  }

  // pid 为 null 的条目无法归并到进程, 每条各自成行并标为归属不明。
  const entries: ProcessEntry[] = [];
  const byPid = new Map<number, ProcessEntry>();

  for (const item of raw) {
    if (item.pid === null) {
      entries.push({
        pid: null,
        ppid: null,
        user: '',
        name: item.name,
        command: item.name,
        cwd: null,
        etime: '',
        listeners: [item.listener],
        origin: 'other',
        killable: false,
        blockedReason: 'unknown-pid',
      });
      continue;
    }

    const existing = byPid.get(item.pid);
    if (existing) {
      existing.listeners.push(item.listener);
      continue;
    }

    const detail = details.get(item.pid);
    const entry: ProcessEntry = {
      pid: item.pid,
      ppid: detail?.ppid ?? null,
      user: detail?.user ?? '',
      name: item.name,
      command: detail?.command ?? item.name,
      cwd: cwds.get(item.pid) ?? null,
      etime: detail?.etime ?? '',
      listeners: [item.listener],
      origin: 'other',
      killable: true,
    };
    byPid.set(item.pid, entry);
    entries.push(entry);
  }

  for (const entry of entries) entry.listeners = mergeListeners(entry.listeners);
  return entries;
}
