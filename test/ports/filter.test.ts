import { describe, expect, it } from 'vitest';

import {
  annotateKillability,
  applyFilters,
  classifyOrigin,
  extractExecutablePath,
  isSystemProcess,
  matchesSearch,
  shortenPath,
  sortEntries,
} from '../../src/ports/filter';
import type { Listener, ProcessEntry } from '../../src/ports/types';

const tcp = (port: number): Listener => ({ protocol: 'TCP', address: '0.0.0.0', port });

const entry = (over: Partial<ProcessEntry>): ProcessEntry => ({
  pid: 100,
  ppid: 1,
  user: 'sky',
  name: 'node',
  command: 'node server.js',
  cwd: null,
  etime: '12:33',
  listeners: [tcp(3000)],
  origin: 'other',
  killable: true,
  ...over,
});

describe('extractExecutablePath', () => {
  it('取第一个空格之前的部分', () => {
    expect(extractExecutablePath('node vite --host')).toBe('node');
    expect(extractExecutablePath('/usr/sbin/sshd -D')).toBe('/usr/sbin/sshd');
  });

  it('Windows 引号包裹的含空格路径被完整取出', () => {
    expect(extractExecutablePath('"C:\\Program Files\\nodejs\\node.exe" vite --host')).toBe(
      'C:\\Program Files\\nodejs\\node.exe'
    );
  });

  it('空命令行不炸', () => {
    expect(extractExecutablePath('')).toBe('');
  });
});

describe('isSystemProcess', () => {
  it('可执行文件在系统目录下即为系统项, 即使端口很高', () => {
    const control = entry({ command: '/System/Library/CoreServices/ControlCenter', listeners: [tcp(58010)] });
    expect(isSystemProcess(control, 1024)).toBe(true);
  });

  it('Windows 系统目录同样命中', () => {
    const svchost = entry({ command: 'C:\\Windows\\system32\\svchost.exe -k RPCSS', listeners: [tcp(49152)] });
    expect(isSystemProcess(svchost, 1024)).toBe(true);
  });

  it('全部端口都在阈值内即为系统项', () => {
    expect(isSystemProcess(entry({ command: 'mystery', listeners: [tcp(22), tcp(80)] }), 1024)).toBe(true);
  });

  it('任一端口超出阈值就不算系统项', () => {
    // 关键行为: 占着 8080 的系统路径外进程不应被静默藏掉。
    expect(isSystemProcess(entry({ command: 'mystery', listeners: [tcp(80), tcp(8080)] }), 1024)).toBe(
      false
    );
  });

  it('普通用户进程不是系统项', () => {
    expect(isSystemProcess(entry({ listeners: [tcp(3000)] }), 1024)).toBe(false);
  });
});

describe('classifyOrigin', () => {
  it('cwd 落在 workspace folder 之下算本工作区', () => {
    const node = entry({ cwd: '/repo/web/apps/site' });
    expect(classifyOrigin(node, ['/repo/web'], 1024)).toBe('workspace');
  });

  it('cwd 与 workspace folder 相等也算本工作区', () => {
    expect(classifyOrigin(entry({ cwd: '/repo/web' }), ['/repo/web'], 1024)).toBe('workspace');
  });

  it('按路径分段比较, /repo/web 不误命中 /repo/webhook', () => {
    expect(classifyOrigin(entry({ cwd: '/repo/webhook' }), ['/repo/web'], 1024)).not.toBe('workspace');
  });

  it('本工作区优先于系统项判定', () => {
    const inWorkspace = entry({ cwd: '/repo/web', command: '/usr/sbin/sshd' });
    expect(classifyOrigin(inWorkspace, ['/repo/web'], 1024)).toBe('workspace');
  });

  it('没有 cwd 时按系统项规则归类', () => {
    expect(classifyOrigin(entry({ cwd: null, command: '/sbin/launchd', listeners: [tcp(9999)] }), [], 1024)).toBe(
      'system'
    );
    expect(classifyOrigin(entry({ cwd: null }), [], 1024)).toBe('other');
  });

  it('Windows 路径分隔符同样按分段比较', () => {
    const node = entry({ cwd: 'C:\\repo\\web\\apps' });
    expect(classifyOrigin(node, ['C:\\repo\\web'], 1024)).toBe('workspace');
    expect(classifyOrigin(entry({ cwd: 'C:\\repo\\webhook' }), ['C:\\repo\\web'], 1024)).not.toBe(
      'workspace'
    );
  });
});

describe('matchesSearch', () => {
  const node = entry({ pid: 41802, name: 'node', command: 'node vite --host', cwd: '/repo/web', listeners: [tcp(5173)] });

  it('空搜索匹配一切', () => {
    expect(matchesSearch(node, '   ')).toBe(true);
  });

  it('匹配进程名, 命令行, PID, cwd 与端口号', () => {
    expect(matchesSearch(node, 'NODE')).toBe(true);
    expect(matchesSearch(node, 'vite')).toBe(true);
    expect(matchesSearch(node, '41802')).toBe(true);
    expect(matchesSearch(node, 'repo/web')).toBe(true);
    expect(matchesSearch(node, '5173')).toBe(true);
  });

  it('不匹配时返回 false', () => {
    expect(matchesSearch(node, 'postgres')).toBe(false);
  });
});

describe('sortEntries', () => {
  it('本工作区优先, 其次最小端口, 最后 PID', () => {
    const sorted = sortEntries([
      entry({ pid: 3, origin: 'other', listeners: [tcp(80)] }),
      entry({ pid: 2, origin: 'workspace', listeners: [tcp(8080)] }),
      entry({ pid: 1, origin: 'workspace', listeners: [tcp(3000)] }),
    ]);
    expect(sorted.map((item) => item.pid)).toEqual([1, 2, 3]);
  });

  it('取最小监听端口作为排序键', () => {
    const sorted = sortEntries([
      entry({ pid: 1, listeners: [tcp(9000), tcp(100)] }),
      entry({ pid: 2, listeners: [tcp(500)] }),
    ]);
    expect(sorted.map((item) => item.pid)).toEqual([1, 2]);
  });

  it('不修改输入数组', () => {
    const input = [entry({ pid: 2, listeners: [tcp(80)] }), entry({ pid: 1, listeners: [tcp(70)] })];
    sortEntries(input);
    expect(input.map((item) => item.pid)).toEqual([2, 1]);
  });
});

describe('annotateKillability', () => {
  const protectedPids = new Set([27948, 28187]);

  it('拿不到 PID 时不可终止', () => {
    const [result] = annotateKillability([entry({ pid: null })], protectedPids, 'sky');
    expect(result.killable).toBe(false);
    expect(result.blockedReason).toBe('unknown-pid');
  });

  it('祖先链中的进程不可终止', () => {
    const [result] = annotateKillability([entry({ pid: 28187 })], protectedPids, 'sky');
    expect(result.killable).toBe(false);
    expect(result.blockedReason).toBe('protected-ancestor');
  });

  it('其他用户的进程不可终止但仍列出', () => {
    const [result] = annotateKillability([entry({ pid: 901, user: 'root' })], protectedPids, 'sky');
    expect(result.killable).toBe(false);
    expect(result.blockedReason).toBe('other-user');
  });

  it('受保护原因优先于其他用户原因', () => {
    const [result] = annotateKillability([entry({ pid: 28187, user: 'root' })], protectedPids, 'sky');
    expect(result.blockedReason).toBe('protected-ancestor');
  });

  it('用户名缺失时不误判为其他用户', () => {
    // Windows 上 GetOwner 可能失败, 此时 user 为空串, 不应因此判成不可终止。
    const [result] = annotateKillability([entry({ pid: 500, user: '' })], protectedPids, 'sky');
    expect(result.killable).toBe(true);
    expect(result.blockedReason).toBeUndefined();
  });

  it('普通同用户进程可终止', () => {
    const [result] = annotateKillability([entry({ pid: 41802 })], protectedPids, 'sky');
    expect(result.killable).toBe(true);
  });
});

describe('applyFilters', () => {
  const entries = [
    entry({ pid: 41802, cwd: '/repo/web', command: 'node vite', listeners: [tcp(5173)] }),
    entry({ pid: 901, cwd: null, command: '/usr/sbin/sshd -D', listeners: [tcp(22)] }),
    entry({ pid: 1201, cwd: '/srv/pg', command: 'postgres', listeners: [tcp(5432)] }),
  ];

  it('默认隐藏系统项', () => {
    const visible = applyFilters(entries, {
      workspaceFolders: ['/repo/web'],
      hideSystemProcesses: true,
      systemPortMax: 1024,
      search: '',
    });
    expect(visible.map((item) => item.pid)).toEqual([41802, 1201]);
  });

  it('关闭隐藏后系统项出现', () => {
    const visible = applyFilters(entries, {
      workspaceFolders: [],
      hideSystemProcesses: false,
      systemPortMax: 1024,
      search: '',
    });
    expect(visible.map((item) => item.pid)).toContain(901);
  });

  it('搜索与系统项过滤叠加生效', () => {
    const visible = applyFilters(entries, {
      workspaceFolders: ['/repo/web'],
      hideSystemProcesses: true,
      systemPortMax: 1024,
      search: '5432',
    });
    expect(visible.map((item) => item.pid)).toEqual([1201]);
  });

  it('标注 origin 并让本工作区排在最前', () => {
    const visible = applyFilters(entries, {
      workspaceFolders: ['/repo/web'],
      hideSystemProcesses: false,
      systemPortMax: 1024,
      search: '',
    });
    expect(visible[0].pid).toBe(41802);
    expect(visible[0].origin).toBe('workspace');
  });
});

describe('shortenPath', () => {
  it('把 home 前缀缩成 ~', () => {
    expect(shortenPath('/Users/sky/repo/web', '/Users/sky')).toBe('~/repo/web');
  });

  it('不在 home 之下时原样返回', () => {
    expect(shortenPath('/srv/app', '/Users/sky')).toBe('/srv/app');
  });

  it('home 为空时原样返回', () => {
    expect(shortenPath('/srv/app', '')).toBe('/srv/app');
  });
});
