import { describe, expect, it } from 'vitest';

import {
  parseLsofCwd,
  parseLsofListeners,
  parsePsDetails,
  scanDarwin,
} from '../../src/ports/scan/darwin';
import { fakeRun, fixture } from './fakeRun';

const lsof = fixture('darwin-lsof.txt');

describe('parseLsofListeners', () => {
  it('把 IPv4 与 IPv6 的同端口视为两条原始记录, 交由聚合合并', () => {
    const processes = parseLsofListeners(lsof);
    const rapportd = processes.find((process) => process.pid === 428);
    expect(rapportd?.listeners).toHaveLength(2);
    expect(rapportd?.listeners.every((listener) => listener.port === 58010)).toBe(true);
  });

  it('不截断进程名, 且能处理含空格与括号的名字', () => {
    const processes = parseLsofListeners(lsof);
    expect(processes.find((process) => process.pid === 430)?.name).toBe('ControlCenter');
    expect(processes.find((process) => process.pid === 28187)?.name).toBe('Code Helper (Plugin)');
  });

  it('ppid 取自 R 字段', () => {
    const processes = parseLsofListeners(lsof);
    expect(processes.find((process) => process.pid === 28187)?.ppid).toBe(27948);
    expect(processes.find((process) => process.pid === 428)?.ppid).toBe(1);
  });

  it('归一化通配地址与 IPv6 方括号', () => {
    const processes = parseLsofListeners(lsof);
    expect(processes.find((process) => process.pid === 428)?.listeners[0].address).toBe('0.0.0.0');
    expect(processes.find((process) => process.pid === 28187)?.listeners[0].address).toBe('::1');
  });

  it('识别 UDP 协议', () => {
    const node = parseLsofListeners(lsof).find((process) => process.pid === 41802);
    expect(node?.listeners.some((listener) => listener.protocol === 'UDP')).toBe(true);
  });

  it('空输出得到空结果', () => {
    expect(parseLsofListeners('')).toEqual([]);
  });
});

describe('parsePsDetails', () => {
  it('只切前两列, 命令行里的空格与括号原样保留', () => {
    const details = parsePsDetails(fixture('darwin-ps.txt'));
    expect(details.get(41802)).toEqual({ etime: '12:33', command: 'node vite --host --port 5173' });
    expect(details.get(28187)?.command).toContain('Code Helper (Plugin)');
  });

  it('etime 的三种形态都能取到', () => {
    const details = parsePsDetails(fixture('darwin-ps.txt'));
    expect(details.get(428)?.etime).toBe('03-19:03:13');
    expect(details.get(28187)?.etime).toBe('19:03:04');
    expect(details.get(41802)?.etime).toBe('12:33');
  });
});

describe('parseLsofCwd', () => {
  it('把 pid 映射到工作目录', () => {
    const cwds = parseLsofCwd(fixture('darwin-cwd.txt'));
    expect(cwds.get(41802)).toBe('/Users/sky/repo/web/apps/site');
    expect(cwds.get(428)).toBe('/');
  });
});

describe('scanDarwin', () => {
  const responses = [
    { match: (file: string, args: string[]) => file === 'lsof' && args.includes('-FpcnLRP'), stdout: lsof },
    { match: (file: string) => file === 'ps', stdout: fixture('darwin-ps.txt') },
    {
      match: (file: string, args: string[]) => file === 'lsof' && args.includes('cwd'),
      stdout: fixture('darwin-cwd.txt'),
    },
  ];

  it('固定 3 次调用, 与端口数量无关', async () => {
    const { run, calls } = fakeRun(responses);
    await scanDarwin(run, { includeUdp: false });
    expect(calls).toHaveLength(3);
  });

  it('合成完整条目并合并 v4/v6 重复项', async () => {
    const { run } = fakeRun(responses);
    const entries = await scanDarwin(run, { includeUdp: false });

    const rapportd = entries.find((entry) => entry.pid === 428);
    expect(rapportd?.listeners).toHaveLength(1);
    expect(rapportd?.command).toBe('/usr/libexec/rapportd');
    expect(rapportd?.etime).toBe('03-19:03:13');

    const node = entries.find((entry) => entry.pid === 41802);
    expect(node?.cwd).toBe('/Users/sky/repo/web/apps/site');
    expect(node?.listeners.map((listener) => listener.port)).toEqual([5173, 24678, 41234]);
  });

  it('includeUdp 决定是否给 lsof 传 -iUDP', async () => {
    const off = fakeRun(responses);
    await scanDarwin(off.run, { includeUdp: false });
    expect(off.calls[0].args).not.toContain('-iUDP');

    const on = fakeRun(responses);
    await scanDarwin(on.run, { includeUdp: true });
    expect(on.calls[0].args).toContain('-iUDP');
  });

  it('没有监听端口时不再调用 ps 与 lsof cwd', async () => {
    const { run, calls } = fakeRun([{ match: () => true, stdout: '' }]);
    expect(await scanDarwin(run, { includeUdp: false })).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('PID 数量超过分块上限时按块调用', async () => {
    // 300 个进程 → ps 与 lsof cwd 各分 2 块, 加上首次 lsof 共 5 次调用。
    const many = Array.from({ length: 300 }, (_, index) => `p${1000 + index}\nR1\ncproc\nLsky\nf3\nPTCP\nn*:${9000 + index}`).join('\n');
    const { run, calls } = fakeRun([
      { match: (file: string, args: string[]) => file === 'lsof' && args.includes('-FpcnLRP'), stdout: many },
      { match: () => true, stdout: '' },
    ]);
    await scanDarwin(run, { includeUdp: false });
    expect(calls).toHaveLength(5);
  });
});
