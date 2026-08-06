import { describe, expect, it } from 'vitest';

import { buildEntries, parseJsonArray, scanWin32 } from '../../src/ports/scan/win32';
import { fakeRun, fixture } from './fakeRun';

/**
 * Windows 侧无法在 macOS 上实机验证, 因此断言全部针对 `ConvertTo-Json` 的输出格式。
 * 重点覆盖上游那个已确认的缺陷: 命令行含逗号时 CSV 解析必然错列。
 */

interface Endpoint {
  LocalAddress: string;
  LocalPort: number;
  OwningProcess: number;
}

describe('parseJsonArray', () => {
  it('把单个对象归一化成数组', () => {
    expect(parseJsonArray<Endpoint>(fixture('win32-single.json'))).toHaveLength(1);
  });

  it('数组原样返回', () => {
    expect(parseJsonArray<Endpoint>(fixture('win32-tcp.json'))).toHaveLength(5);
  });

  it('空输出与 null 都得到空数组', () => {
    expect(parseJsonArray('')).toEqual([]);
    expect(parseJsonArray('   ')).toEqual([]);
    expect(parseJsonArray('null')).toEqual([]);
  });
});

describe('buildEntries', () => {
  const tcp = parseJsonArray<Endpoint>(fixture('win32-tcp.json'));
  const udp = parseJsonArray<Endpoint>(fixture('win32-udp.json'));
  const processes = parseJsonArray<Parameters<typeof buildEntries>[2][number]>(
    fixture('win32-process.json')
  );

  it('命令行含逗号时不错列', () => {
    const entries = buildEntries(tcp, udp, processes);
    const node = entries.find((entry) => entry.pid === 41802);
    expect(node?.command).toBe('"C:\\Program Files\\nodejs\\node.exe" vite --host, --port 5173');
    expect(node?.name).toBe('node.exe');
  });

  it('按 OwningProcess 聚合并合并 v4/v6 同端口', () => {
    const entries = buildEntries(tcp, udp, processes);
    const svchost = entries.find((entry) => entry.pid === 880);
    // 0.0.0.0:135 与 :::135 合并成一条。
    expect(svchost?.listeners).toHaveLength(1);
  });

  it('UDP 端点带上 UDP 协议', () => {
    const entries = buildEntries(tcp, udp, processes);
    const node = entries.find((entry) => entry.pid === 41802);
    expect(node?.listeners.find((listener) => listener.port === 41234)?.protocol).toBe('UDP');
  });

  it('忽略 OwningProcess 为 0 的 System Idle Process', () => {
    const entries = buildEntries(tcp, udp, processes);
    expect(entries.some((entry) => entry.pid === 0)).toBe(false);
  });

  it('带上所属用户与运行时长', () => {
    const entries = buildEntries(tcp, udp, processes);
    expect(entries.find((entry) => entry.pid === 880)?.user).toBe('NETWORK SERVICE');
    expect(entries.find((entry) => entry.pid === 41802)?.etime).toBe('00:12:33');
  });

  it('缺少对应进程信息时不丢弃端点', () => {
    const entries = buildEntries([{ LocalAddress: '0.0.0.0', LocalPort: 9999, OwningProcess: 777 }], [], []);
    expect(entries).toHaveLength(1);
    expect(entries[0].command).toBe('');
  });
});

describe('scanWin32', () => {
  const responses = [
    {
      match: (_file: string, args: string[]) => args[3].includes('Get-NetTCPConnection'),
      stdout: fixture('win32-tcp.json'),
    },
    {
      match: (_file: string, args: string[]) => args[3].includes('Get-NetUDPEndpoint'),
      stdout: fixture('win32-udp.json'),
    },
    {
      match: (_file: string, args: string[]) => args[3].includes('Win32_Process'),
      stdout: fixture('win32-process.json'),
    },
  ];

  it('includeUdp 关闭时只发两条命令', async () => {
    const { run, calls } = fakeRun(responses);
    await scanWin32(run, { includeUdp: false });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.file === 'powershell.exe')).toBe(true);
  });

  it('includeUdp 开启时额外查 UDP', async () => {
    const { run, calls } = fakeRun(responses);
    const entries = await scanWin32(run, { includeUdp: true });
    expect(calls).toHaveLength(3);
    expect(entries.find((entry) => entry.pid === 41802)?.listeners).toHaveLength(3);
  });

  it('进程查询只 filter 实际占用端口的 PID', async () => {
    const { run, calls } = fakeRun(responses);
    await scanWin32(run, { includeUdp: false });
    const script = calls[1].args[3];
    expect(script).toContain('ProcessId=880');
    expect(script).toContain('ProcessId=41802');
    // OwningProcess 为 0 的那条不进 filter。
    expect(script).not.toContain('ProcessId=0');
  });

  it('没有监听端口时不再查进程', async () => {
    const { run, calls } = fakeRun([{ match: () => true, stdout: '' }]);
    expect(await scanWin32(run, { includeUdp: false })).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
