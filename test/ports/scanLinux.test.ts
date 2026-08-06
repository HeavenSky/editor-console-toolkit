import { describe, expect, it } from 'vitest';

import { parseNetstat, parsePsDetails, parseSs, scanLinux } from '../../src/ports/scan/linux';
import { fakeRun, fixture } from './fakeRun';

/**
 * Linux 侧无法在 macOS 上实机验证, 因此断言全部针对固化的真实输出格式。
 * 重点覆盖上游两个已确认的缺陷: 混合协议导致的列错位, 与非 root 时丢弃整条记录。
 */

describe('parseSs', () => {
  it('取第 4 列作为本地地址', () => {
    const rows = parseSs(fixture('linux-ss-tcp.txt'), 'TCP');
    expect(rows.map((row) => row.listener.port)).toEqual([5432, 80, 80, 22, 5173]);
    expect(rows[0].listener.address).toBe('127.0.0.1');
  });

  it('从 users:((...)) 取第一个 pid 与进程名', () => {
    const rows = parseSs(fixture('linux-ss-tcp.txt'), 'TCP');
    expect(rows[1].pid).toBe(1234);
    expect(rows[1].name).toBe('nginx');
  });

  it('非 root 缺 users:((...)) 时保留条目, pid 记为 null', () => {
    const rows = parseSs(fixture('linux-ss-noroot.txt'), 'TCP');
    expect(rows).toHaveLength(3);
    expect(rows[0].pid).toBeNull();
    expect(rows[2].pid).toBe(41802);
  });

  it('IPv6 的 [::] 被归一化', () => {
    const rows = parseSs(fixture('linux-ss-tcp.txt'), 'TCP');
    expect(rows[2].listener.address).toBe('::');
  });
});

describe('parseNetstat', () => {
  it('不按列号取 PID, 因此 TCP 与 UDP 的列数差异不影响解析', () => {
    const tcp = parseNetstat(fixture('linux-netstat.txt'), 'TCP');
    const sshd = tcp.find((row) => row.listener.port === 22);
    const dhclient = tcp.find((row) => row.listener.port === 68);

    expect(sshd?.pid).toBe(901);
    expect(sshd?.name).toBe('sshd');
    // udp 行没有 State 列, PID 仍取到。
    expect(dhclient?.pid).toBe(712);
    expect(dhclient?.name).toBe('dhclient');
  });

  it('跳过表头行', () => {
    const rows = parseNetstat(fixture('linux-netstat.txt'), 'TCP');
    expect(rows).toHaveLength(4);
  });

  it('处理 tcp6 的 :::80 写法', () => {
    const rows = parseNetstat(fixture('linux-netstat.txt'), 'TCP');
    const nginx = rows.find((row) => row.pid === 1234);
    expect(nginx?.listener.port).toBe(80);
  });
});

describe('parsePsDetails', () => {
  it('切出 ppid, user 与 etime 后, 命令行剩余部分原样保留', () => {
    const details = parsePsDetails('41802 41799 sky    12:33 node vite --host --port 5173\n');
    expect(details.get(41802)).toEqual({
      ppid: 41799,
      user: 'sky',
      etime: '12:33',
      command: 'node vite --host --port 5173',
    });
  });
});

describe('scanLinux', () => {
  const responses = [
    { match: (file: string, args: string[]) => file === 'ss' && args[0] === '-tlnpH', stdout: fixture('linux-ss-tcp.txt') },
    { match: (file: string, args: string[]) => file === 'ss' && args[0] === '-ulnpH', stdout: '' },
    {
      match: (file: string) => file === 'ps',
      stdout: [
        ' 1201  1100 postgres 03-19:03:13 /usr/lib/postgresql/16/bin/postgres',
        ' 1234   900 root         19:03:04 nginx: master process /usr/sbin/nginx',
        '  901     1 root     03-19:03:13 /usr/sbin/sshd -D',
        '41802 41799 sky             12:33 node vite --host --port 5173',
      ].join('\n'),
    },
    { match: (file: string) => file === 'readlink', stdout: '/srv/app\n' },
  ];

  it('把同一 pid 的多个端口聚合成一条', async () => {
    const { run } = fakeRun(responses);
    const entries = await scanLinux(run, { includeUdp: false });
    const nginx = entries.find((entry) => entry.pid === 1234);
    // 0.0.0.0:80 与 [::]:80 合并成一条。
    expect(nginx?.listeners).toHaveLength(1);
    expect(nginx?.listeners[0].port).toBe(80);
  });

  it('补上 ps 提供的 ppid, user 与命令行', async () => {
    const { run } = fakeRun(responses);
    const entries = await scanLinux(run, { includeUdp: false });
    const node = entries.find((entry) => entry.pid === 41802);
    expect(node?.ppid).toBe(41799);
    expect(node?.user).toBe('sky');
    expect(node?.command).toBe('node vite --host --port 5173');
  });

  it('ss 不可用时回退 netstat', async () => {
    const { run, calls } = fakeRun([
      { match: (file: string) => file === 'ss', throws: 'ss: command not found' },
      { match: (file: string, args: string[]) => file === 'netstat' && args[0] === '-tlnp', stdout: fixture('linux-netstat.txt') },
      { match: (file: string) => file === 'ps', stdout: '' },
      { match: (file: string) => file === 'readlink', stdout: '' },
    ]);
    const entries = await scanLinux(run, { includeUdp: false });
    expect(calls.some((call) => call.file === 'netstat')).toBe(true);
    expect(entries.some((entry) => entry.pid === 901)).toBe(true);
  });

  it('pid 为 null 的条目各自成行并标为归属不明', async () => {
    const { run } = fakeRun([
      { match: (file: string, args: string[]) => file === 'ss' && args[0] === '-tlnpH', stdout: fixture('linux-ss-noroot.txt') },
      { match: (file: string) => file === 'ps', stdout: '' },
      { match: (file: string) => file === 'readlink', stdout: '' },
    ]);
    const entries = await scanLinux(run, { includeUdp: false });
    const unknown = entries.filter((entry) => entry.pid === null);
    expect(unknown).toHaveLength(2);
    expect(unknown.every((entry) => entry.killable === false)).toBe(true);
    expect(unknown.every((entry) => entry.blockedReason === 'unknown-pid')).toBe(true);
  });

  it('includeUdp 关闭时不查 UDP', async () => {
    const { run, calls } = fakeRun(responses);
    await scanLinux(run, { includeUdp: false });
    expect(calls.some((call) => call.args[0] === '-ulnpH')).toBe(false);
  });

  it('readlink 失败不影响其余字段', async () => {
    const { run } = fakeRun([
      { match: (file: string, args: string[]) => file === 'ss' && args[0] === '-tlnpH', stdout: fixture('linux-ss-tcp.txt') },
      { match: (file: string) => file === 'ps', stdout: ' 901     1 root     03-19:03:13 /usr/sbin/sshd -D' },
      { match: (file: string) => file === 'readlink', throws: 'permission denied' },
    ]);
    const entries = await scanLinux(run, { includeUdp: false });
    const sshd = entries.find((entry) => entry.pid === 901);
    expect(sshd?.cwd).toBeNull();
    expect(sshd?.command).toBe('/usr/sbin/sshd -D');
  });
});
