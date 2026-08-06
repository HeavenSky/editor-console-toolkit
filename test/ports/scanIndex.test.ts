import { describe, expect, it } from 'vitest';

import { aggregate, scanPorts } from '../../src/ports/scan/index';
import type { ProcessEntry } from '../../src/ports/types';
import { fakeRun, fixture } from './fakeRun';

const entry = (over: Partial<ProcessEntry>): ProcessEntry => ({
  pid: 1,
  ppid: null,
  user: 'sky',
  name: 'node',
  command: 'node server.js',
  cwd: null,
  etime: '12:33',
  listeners: [],
  origin: 'other',
  killable: true,
  ...over,
});

describe('aggregate', () => {
  it('同一 pid 的多条记录合并成一条, 端口累加', () => {
    const merged = aggregate([
      entry({ pid: 7, listeners: [{ protocol: 'TCP', address: '0.0.0.0', port: 5173 }] }),
      entry({ pid: 7, listeners: [{ protocol: 'TCP', address: '127.0.0.1', port: 24678 }] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].listeners.map((listener) => listener.port)).toEqual([5173, 24678]);
  });

  it('信息更全的那条补上缺失字段', () => {
    const merged = aggregate([
      entry({ pid: 7, cwd: null, listeners: [{ protocol: 'TCP', address: '0.0.0.0', port: 1 }] }),
      entry({ pid: 7, cwd: '/srv/app', listeners: [{ protocol: 'TCP', address: '0.0.0.0', port: 2 }] }),
    ]);
    expect(merged[0].cwd).toBe('/srv/app');
  });

  it('pid 为 null 的条目不被合并', () => {
    const merged = aggregate([
      entry({ pid: null, listeners: [{ protocol: 'TCP', address: '0.0.0.0', port: 80 }] }),
      entry({ pid: null, listeners: [{ protocol: 'TCP', address: '0.0.0.0', port: 443 }] }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('不修改传入的条目', () => {
    const original = entry({ pid: 7, listeners: [{ protocol: 'TCP', address: '0.0.0.0', port: 1 }] });
    aggregate([original, entry({ pid: 7, listeners: [{ protocol: 'TCP', address: '0.0.0.0', port: 2 }] })]);
    expect(original.listeners).toHaveLength(1);
  });
});

describe('scanPorts', () => {
  const darwinResponses = [
    { match: (file: string, args: string[]) => file === 'lsof' && args.includes('-FpcnLRP'), stdout: fixture('darwin-lsof.txt') },
    { match: (file: string) => file === 'ps', stdout: fixture('darwin-ps.txt') },
    { match: (file: string, args: string[]) => file === 'lsof' && args.includes('cwd'), stdout: fixture('darwin-cwd.txt') },
  ];

  it('按平台派发', async () => {
    const { run } = fakeRun(darwinResponses);
    const result = await scanPorts({ includeUdp: false }, run, 'darwin');
    expect(result.error).toBeUndefined();
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('不支持的平台返回带原因的空结果, 不抛异常', async () => {
    const { run, calls } = fakeRun([{ match: () => true, stdout: '' }]);
    const result = await scanPorts({ includeUdp: false }, run, 'aix');
    expect(result.entries).toEqual([]);
    expect(result.error).toContain('aix');
    expect(calls).toHaveLength(0);
  });

  it('命令失败转成 error 而不是抛出', async () => {
    const { run } = fakeRun([{ match: () => true, throws: 'lsof: command not found' }]);
    const result = await scanPorts({ includeUdp: false }, run, 'darwin');
    expect(result.entries).toEqual([]);
    expect(result.error).toContain('lsof: command not found');
  });
});
