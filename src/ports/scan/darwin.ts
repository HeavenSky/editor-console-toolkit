import type { Listener, ProcessEntry, RunCommand, ScanOptions } from '../types';
import { mergeListeners, parseEndpoint } from './address';

/**
 * macOS 采集: 3 次固定调用, 与端口数量无关。
 *
 * 1. `lsof -FpcnLRP` 一次拿到 pid, ppid(`R`), 完整进程名(`c`), 用户(`L`), 协议(`P`) 与
 *    地址:端口(`n`) —— 必须用 `-F`, 默认表格输出会把 COMMAND 列截断到 9 字符
 *    (`ControlCenter` 会变成 `ControlCe`);
 * 2. `ps -ww -o pid=,etime=,args=` 批量拿运行时长与完整命令行 —— `etime` 而不是 `lstart`,
 *    后者的格式随 locale 变;
 * 3. `lsof -d cwd` 批量拿工作目录。
 *
 * 后两步都接受逗号分隔的 PID 列表, 按 `PID_CHUNK` 分块以免超出 argv 长度上限。
 */
const PID_CHUNK = 256;

interface LsofProcess {
  pid: number;
  ppid: number | null;
  user: string;
  name: string;
  listeners: Listener[];
}

/**
 * 解析 `lsof -F` 的机器可读输出。
 *
 * 每行是"单字符字段名 + 值"。`p` 开一个进程段, `f` 开一个文件段, 进程级字段 (`R`/`c`/`L`)
 * 出现在 `p` 之后, 文件级字段 (`P`/`n`) 出现在 `f` 之后。
 */
export function parseLsofListeners(stdout: string): LsofProcess[] {
  const processes: LsofProcess[] = [];
  let current: LsofProcess | null = null;
  let protocol: 'TCP' | 'UDP' | null = null;

  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    const field = line[0];
    const value = line.slice(1);

    switch (field) {
      case 'p': {
        const pid = Number(value);
        current = Number.isInteger(pid)
          ? { pid, ppid: null, user: '', name: '', listeners: [] }
          : null;
        if (current) processes.push(current);
        protocol = null;
        break;
      }
      case 'R':
        if (current) current.ppid = Number.isInteger(Number(value)) ? Number(value) : null;
        break;
      case 'c':
        if (current) current.name = value;
        break;
      case 'L':
        if (current) current.user = value;
        break;
      case 'f':
        protocol = null;
        break;
      case 'P':
        protocol = value === 'UDP' ? 'UDP' : 'TCP';
        break;
      case 'n': {
        if (!current || !protocol) break;
        const endpoint = parseEndpoint(value);
        if (endpoint) current.listeners.push({ protocol, ...endpoint });
        break;
      }
      default:
        break;
    }
  }

  return processes.filter((process) => process.listeners.length > 0);
}

/** 解析 `ps -ww -o pid=,etime=,args=`; 命令行本身含空格, 所以只切前两列。 */
export function parsePsDetails(stdout: string): Map<number, { etime: string; command: string }> {
  const details = new Map<number, { etime: string; command: string }>();

  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    details.set(Number(match[1]), { etime: match[2], command: match[3] });
  }

  return details;
}

/** 解析 `lsof -d cwd -Fpn`; `n` 紧跟在 `fcwd` 之后。 */
export function parseLsofCwd(stdout: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | null = null;

  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    if (line[0] === 'p') {
      const parsed = Number(line.slice(1));
      pid = Number.isInteger(parsed) ? parsed : null;
    } else if (line[0] === 'n' && pid !== null) {
      cwds.set(pid, line.slice(1));
    }
  }

  return cwds;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function scanDarwin(
  run: RunCommand,
  options: ScanOptions
): Promise<ProcessEntry[]> {
  const args = ['-nP', '-iTCP', '-sTCP:LISTEN'];
  if (options.includeUdp) args.push('-iUDP');
  args.push('-FpcnLRP');

  const { stdout } = await run('lsof', args);
  const processes = parseLsofListeners(stdout);
  if (processes.length === 0) return [];

  const pids = processes.map((process) => process.pid);
  const details = new Map<number, { etime: string; command: string }>();
  const cwds = new Map<number, string>();

  for (const group of chunk(pids, PID_CHUNK)) {
    const list = group.join(',');
    const ps = await run('ps', ['-ww', '-o', 'pid=,etime=,args=', '-p', list]);
    for (const [pid, detail] of parsePsDetails(ps.stdout)) details.set(pid, detail);

    const cwd = await run('lsof', ['-a', '-p', list, '-d', 'cwd', '-Fpn']);
    for (const [pid, path] of parseLsofCwd(cwd.stdout)) cwds.set(pid, path);
  }

  return processes.map((process) => {
    const detail = details.get(process.pid);
    return {
      pid: process.pid,
      ppid: process.ppid,
      user: process.user,
      name: process.name,
      command: detail?.command ?? process.name,
      cwd: cwds.get(process.pid) ?? null,
      etime: detail?.etime ?? '',
      listeners: mergeListeners(process.listeners),
      origin: 'other',
      killable: true,
    };
  });
}
