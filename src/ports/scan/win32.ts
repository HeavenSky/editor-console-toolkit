import type { Listener, ProcessEntry, RunCommand, ScanOptions } from '../types';
import { mergeListeners } from './address';

/**
 * Windows 采集: 两次 PowerShell 调用, 全程 JSON。
 *
 * 刻意不用 `wmic`: 它在新版 Windows 上已被弃用, 而且 `/format:csv` 的输出在命令行本身
 * 含逗号时会错列 —— 用 `split(',')` 解析 CommandLine 是不可能正确的。`ConvertTo-Json`
 * 没有这个问题。
 *
 * 第二次调用只查第一步拿到的那几个 PID (`-Filter`), 不拉全量进程表, 因此可以承受
 * 逐进程 `GetOwner` 的开销来拿到所属用户。
 */

interface RawEndpoint {
  LocalAddress: string;
  LocalPort: number;
  OwningProcess: number;
  Protocol?: string;
}

interface RawProcess {
  ProcessId: number;
  ParentProcessId: number | null;
  Name: string;
  CommandLine: string | null;
  UserName: string | null;
  Elapsed: string | null;
}

/**
 * PowerShell 在结果只有一条时输出单个对象而不是数组, 因此必须归一化。
 * 空结果时 `ConvertTo-Json` 输出空字符串。
 */
export function parseJsonArray<T>(stdout: string): T[] {
  const text = stdout.trim();
  if (text === '') return [];

  const parsed: unknown = JSON.parse(text);
  if (parsed === null) return [];
  return Array.isArray(parsed) ? (parsed as T[]) : [parsed as T];
}

/** IPv6 通配地址在 `Get-NetTCPConnection` 里是 `::`, 与 POSIX 侧保持一致即可。 */
function toListener(endpoint: RawEndpoint, fallback: 'TCP' | 'UDP'): Listener {
  const protocol = endpoint.Protocol === 'UDP' || fallback === 'UDP' ? 'UDP' : 'TCP';
  return { protocol, address: endpoint.LocalAddress, port: endpoint.LocalPort };
}

/** 把端点与进程信息合成 `ProcessEntry`, 按 OwningProcess 聚合。 */
export function buildEntries(
  tcp: RawEndpoint[],
  udp: RawEndpoint[],
  processes: RawProcess[]
): ProcessEntry[] {
  const byPid = new Map<number, RawProcess>();
  for (const process of processes) byPid.set(process.ProcessId, process);

  const entries = new Map<number, ProcessEntry>();

  const add = (endpoint: RawEndpoint, fallback: 'TCP' | 'UDP') => {
    // PID 0 是 System Idle Process, 不是真实的可管理进程。
    if (!endpoint.OwningProcess) return;

    const listener = toListener(endpoint, fallback);
    const existing = entries.get(endpoint.OwningProcess);
    if (existing) {
      existing.listeners.push(listener);
      return;
    }

    const process = byPid.get(endpoint.OwningProcess);
    entries.set(endpoint.OwningProcess, {
      pid: endpoint.OwningProcess,
      ppid: process?.ParentProcessId ?? null,
      user: process?.UserName ?? '',
      name: process?.Name ?? '',
      command: process?.CommandLine ?? process?.Name ?? '',
      cwd: null,
      etime: process?.Elapsed ?? '',
      listeners: [listener],
      origin: 'other',
      killable: true,
    });
  };

  for (const endpoint of tcp) add(endpoint, 'TCP');
  for (const endpoint of udp) add(endpoint, 'UDP');

  const result = [...entries.values()];
  for (const entry of result) entry.listeners = mergeListeners(entry.listeners);
  return result;
}

const POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-Command'];

/**
 * Win32_Process 没有 CommandLine 之外的所属用户属性, 用户名只能通过 GetOwner 方法拿,
 * 因此这段脚本逐进程调用它; 由于只查监听端口的那几个 PID, 数量很小。
 * Elapsed 由 PowerShell 算好并格式化成与 POSIX `etime` 相同的形状, 解析侧不做时间运算。
 */
function processScript(pids: number[]): string {
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(' or ');
  return [
    `Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object {`,
    '  $owner = try { (Invoke-CimMethod -InputObject $_ -MethodName GetOwner).User } catch { $null };',
    '  $span = if ($_.CreationDate) { (Get-Date) - $_.CreationDate } else { $null };',
    '  $elapsed = if ($span -eq $null) { $null }',
    '    elseif ($span.Days -gt 0) { "{0:00}-{1:00}:{2:00}:{3:00}" -f $span.Days,$span.Hours,$span.Minutes,$span.Seconds }',
    '    else { "{0:00}:{1:00}:{2:00}" -f $span.Hours,$span.Minutes,$span.Seconds };',
    '  [pscustomobject]@{',
    '    ProcessId = $_.ProcessId; ParentProcessId = $_.ParentProcessId;',
    '    Name = $_.Name; CommandLine = $_.CommandLine;',
    '    UserName = $owner; Elapsed = $elapsed',
    '  }',
    '} | ConvertTo-Json -Compress -Depth 3',
  ].join('\n');
}

export async function scanWin32(run: RunCommand, options: ScanOptions): Promise<ProcessEntry[]> {
  const tcpScript =
    'Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress';
  const udpScript =
    'Get-NetUDPEndpoint | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress';

  const tcpResult = await run('powershell.exe', [...POWERSHELL_ARGS, tcpScript]);
  const tcp = parseJsonArray<RawEndpoint>(tcpResult.stdout);

  let udp: RawEndpoint[] = [];
  if (options.includeUdp) {
    const udpResult = await run('powershell.exe', [...POWERSHELL_ARGS, udpScript]);
    udp = parseJsonArray<RawEndpoint>(udpResult.stdout);
  }

  const pids = [...new Set([...tcp, ...udp].map((item) => item.OwningProcess).filter(Boolean))];
  if (pids.length === 0) return [];

  const processResult = await run('powershell.exe', [...POWERSHELL_ARGS, processScript(pids)]);
  return buildEntries(tcp, udp, parseJsonArray<RawProcess>(processResult.stdout));
}
