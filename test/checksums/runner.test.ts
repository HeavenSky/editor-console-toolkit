import { describe, expect, it } from 'vitest';

import { backupName, computeChecksum } from '../../src/checksums/core';
import { applyChecksums, restoreChecksums } from '../../src/checksums/runner';
import type { FsSeam, RunContext } from '../../src/checksums/types';

/**
 * 编排层的回归覆盖, 全部跑在内存接缝上。
 *
 * 这里断言的正是没法在真实安装目录上安全复现的几条: 权限不足, 写到一半失败, 以及备份与
 * 目标文件的先后顺序。任何一条顺序错了, 后果都是编辑器起不来, 因此必须由测试钉住。
 */

const APP_ROOT = '/app';
const STAGING = '/tmp/ect';
const VERSION = '1.132.0';

const CORE = 'vs/workbench/workbench.desktop.main.js';
const CORE_PATH = `${APP_ROOT}/out/${CORE}`;
const PRODUCT = `${APP_ROOT}/product.json`;
const BACKUP = `${APP_ROOT}/${backupName(VERSION)}`;
const TEMP = `${APP_ROOT}/product.json.ect-tmp`;
const STAGED = `${STAGING}/product.json`;

const encoder = new TextEncoder();

const product = (checksums: Record<string, string>): string =>
  JSON.stringify({ nameShort: 'Code', checksums }, null, '\t');

const checksumsOf = (text: string): Record<string, string> =>
  (JSON.parse(text) as { checksums: Record<string, string> }).checksums;

function errno(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${code}: operation not permitted`);
  error.code = code;
  return error;
}

interface Fake {
  fs: FsSeam;
  files: Map<string, string>;
  dirs: Set<string>;
}

/**
 * 内存文件系统。
 *
 * `denyWrite` 决定哪些路径的写入 (含 copy, rename, remove) 会抛错, 用来模拟只读安装目录;
 * 抛出的 errno 由 `code` 决定, 因为编排层正是靠它区分"没权限"和"真的坏了"。
 */
function fake(
  initial: Record<string, string>,
  denyWrite: (path: string) => boolean = () => false,
  code = 'EACCES',
): Fake {
  const files = new Map(Object.entries(initial));
  const dirs = new Set<string>();

  const readText = (path: string): string => {
    const content = files.get(path);
    if (content === undefined) throw errno('ENOENT');
    return content;
  };

  const write = (path: string, content: string): void => {
    if (denyWrite(path)) throw errno(code);
    files.set(path, content);
  };

  const fs: FsSeam = {
    exists: (path) => files.has(path),
    readText,
    readBytes: (path) => encoder.encode(readText(path)),
    writeText: write,
    copy: (from, to) => {
      write(to, readText(from));
    },
    rename: (from, to) => {
      write(to, readText(from));
      files.delete(from);
    },
    remove: (path) => {
      if (denyWrite(path)) throw errno(code);
      files.delete(path);
    },
    list: (dir) =>
      [...files.keys()]
        .filter((path) => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/'))
        .map((path) => path.slice(dir.length + 1)),
    ensureDir: (path) => {
      dirs.add(path);
    },
  };

  return { fs, files, dirs };
}

const context = (fs: FsSeam, platform = 'darwin'): RunContext => ({
  fs,
  appRoot: APP_ROOT,
  version: VERSION,
  platform,
  stagingDir: STAGING,
});

/** 已被修改的核心文件, 以及它的正确摘要。 */
const PATCHED = 'patched core file';
const FRESH = computeChecksum(encoder.encode(PATCHED));

describe('applyChecksums', () => {
  it('首次修复: 建备份, 原子替换 product.json, 不留临时文件', () => {
    const original = product({ [CORE]: 'stale' });
    const { fs, files } = fake({ [PRODUCT]: original, [CORE_PATH]: PATCHED });

    const outcome = applyChecksums(context(fs));

    expect(outcome.kind).toBe('applied');
    expect(outcome.changed).toBe(1);
    expect(files.get(BACKUP)).toBe(original);
    expect(checksumsOf(files.get(PRODUCT) ?? '')[CORE]).toBe(FRESH);
    expect(files.has(TEMP)).toBe(false);
  });

  it('备份已存在时不覆盖它', () => {
    const { fs, files } = fake({
      [PRODUCT]: product({ [CORE]: 'stale' }),
      [CORE_PATH]: PATCHED,
      [BACKUP]: 'the very first product.json',
    });

    expect(applyChecksums(context(fs)).kind).toBe('applied');
    expect(files.get(BACKUP)).toBe('the very first product.json');
  });

  it('没有差异时不写盘, 也不建备份', () => {
    const original = product({ [CORE]: FRESH });
    const { fs, files } = fake({ [PRODUCT]: original, [CORE_PATH]: PATCHED });

    const outcome = applyChecksums(context(fs));

    expect(outcome.kind).toBe('unchanged');
    expect(outcome.changed).toBe(0);
    expect(files.get(PRODUCT)).toBe(original);
    expect(files.has(BACKUP)).toBe(false);
  });

  it('缺失的文件被跳过并计数, 其余照常修复', () => {
    const { fs, files } = fake({
      [PRODUCT]: product({ [CORE]: 'stale', 'vs/gone.js': 'whatever' }),
      [CORE_PATH]: PATCHED,
    });

    const outcome = applyChecksums(context(fs));

    expect(outcome.kind).toBe('applied');
    expect(outcome.changed).toBe(1);
    expect(outcome.missing).toBe(1);
    expect(checksumsOf(files.get(PRODUCT) ?? '')['vs/gone.js']).toBe('whatever');
  });

  it('product.json 读不到时是读取失败, 不是崩溃', () => {
    const { fs } = fake({ [CORE_PATH]: PATCHED });
    const outcome = applyChecksums(context(fs));

    expect(outcome.kind).toBe('read-failed');
    expect(outcome.detail).toContain('ENOENT');
  });

  it('安装没有登记校验和时如实报告', () => {
    const { fs } = fake({ [PRODUCT]: JSON.stringify({ nameShort: 'Code' }) });
    expect(applyChecksums(context(fs)).kind).toBe('no-checksums');
  });

  it('没有写权限时暂存内容并给出含备份步骤的手动命令', () => {
    const original = product({ [CORE]: 'stale' });
    const { fs, files } = fake(
      { [PRODUCT]: original, [CORE_PATH]: PATCHED },
      (path) => path.startsWith(`${APP_ROOT}/`),
    );

    const outcome = applyChecksums(context(fs));

    expect(outcome.kind).toBe('permission-denied');
    expect(outcome.stagedPath).toBe(STAGED);
    expect(outcome.command).toBe(
      `sudo cp "${PRODUCT}" "${BACKUP}" && sudo cp "${STAGED}" "${PRODUCT}"`,
    );
    // 原文一个字节都没动, 修好的内容在暂存文件里等着用户自己写回。
    expect(files.get(PRODUCT)).toBe(original);
    expect(checksumsOf(files.get(STAGED) ?? '')[CORE]).toBe(FRESH);
    expect(files.has(TEMP)).toBe(false);
  });

  it('备份已存在时的手动命令只有写回一步', () => {
    const { fs } = fake(
      { [PRODUCT]: product({ [CORE]: 'stale' }), [CORE_PATH]: PATCHED, [BACKUP]: 'earlier' },
      (path) => path === TEMP || path === PRODUCT,
    );

    const outcome = applyChecksums(context(fs));

    expect(outcome.command).toBe(`sudo cp "${STAGED}" "${PRODUCT}"`);
    expect(outcome.command).not.toContain('&&');
  });

  it('Windows 的手动命令用 copy /Y', () => {
    const { fs } = fake(
      { [PRODUCT]: product({ [CORE]: 'stale' }), [CORE_PATH]: PATCHED, [BACKUP]: 'earlier' },
      (path) => path.startsWith(`${APP_ROOT}/`),
    );

    expect(applyChecksums(context(fs, 'win32')).command).toBe(
      `copy /Y "${STAGED}" "${PRODUCT}"`,
    );
  });

  it('非权限类写失败如实报告, 并清掉临时文件', () => {
    const original = product({ [CORE]: 'stale' });
    const { fs, files } = fake(
      { [PRODUCT]: original, [CORE_PATH]: PATCHED },
      (path) => path === TEMP,
      'ENOSPC',
    );

    const outcome = applyChecksums(context(fs));

    expect(outcome.kind).toBe('write-failed');
    expect(outcome.detail).toContain('ENOSPC');
    expect(files.get(PRODUCT)).toBe(original);
    expect(files.has(TEMP)).toBe(false);
  });

  it('顺手清理旧版本留下的自家备份, 但不碰当前备份与上游命名的文件', () => {
    const upstream = `${APP_ROOT}/product.json.orig.${VERSION}`;
    const { fs, files } = fake({
      [PRODUCT]: product({ [CORE]: FRESH }),
      [CORE_PATH]: PATCHED,
      [BACKUP]: 'current',
      [`${APP_ROOT}/product.json.ect-orig.1.99.0`]: 'stale one',
      [upstream]: 'not ours',
    });

    const outcome = applyChecksums(context(fs));

    expect(outcome.cleaned).toBe(1);
    expect(files.has(`${APP_ROOT}/product.json.ect-orig.1.99.0`)).toBe(false);
    expect(files.has(BACKUP)).toBe(true);
    expect(files.has(upstream)).toBe(true);
  });
});

describe('restoreChecksums', () => {
  it('没有本插件的备份时什么都不做', () => {
    const { fs, files } = fake({ [PRODUCT]: 'patched' });

    const outcome = restoreChecksums(context(fs));

    expect(outcome.kind).toBe('no-backup');
    expect(files.get(PRODUCT)).toBe('patched');
  });

  it('先把备份写回, 成功之后才删备份', () => {
    const { fs, files } = fake({ [PRODUCT]: 'patched', [BACKUP]: 'original' });

    const outcome = restoreChecksums(context(fs));

    expect(outcome.kind).toBe('restored');
    expect(files.get(PRODUCT)).toBe('original');
    expect(files.has(BACKUP)).toBe(false);
    expect(files.has(TEMP)).toBe(false);
  });

  it('写回失败时备份仍然在, 不会两份都丢', () => {
    const { fs, files } = fake(
      { [PRODUCT]: 'patched', [BACKUP]: 'original' },
      (path) => path === TEMP || path === PRODUCT,
    );

    const outcome = restoreChecksums(context(fs));

    expect(outcome.kind).toBe('permission-denied');
    expect(outcome.stagedPath).toBeUndefined();
    expect(outcome.command).toBe(`sudo cp "${BACKUP}" "${PRODUCT}"`);
    expect(files.get(PRODUCT)).toBe('patched');
    expect(files.get(BACKUP)).toBe('original');
  });

  it('备份读不出来时是读取失败', () => {
    const { fs } = fake({ [PRODUCT]: 'patched' });
    // exists 为真但读取抛错的情况: 用一个只在 readText 阶段失败的备份路径模拟不可读。
    const broken: FsSeam = {
      ...fs,
      exists: () => true,
      readText: () => {
        throw errno('EACCES');
      },
    };

    const outcome = restoreChecksums(context(broken));

    expect(outcome.kind).toBe('read-failed');
    expect(outcome.detail).toContain('EACCES');
  });

  it('还原之后同样清理陈旧备份', () => {
    const { fs, files } = fake({
      [PRODUCT]: 'patched',
      [BACKUP]: 'original',
      [`${APP_ROOT}/product.json.ect-orig.1.99.0`]: 'stale one',
    });

    const outcome = restoreChecksums(context(fs));

    expect(outcome.kind).toBe('restored');
    expect(outcome.cleaned).toBe(1);
    expect(files.has(`${APP_ROOT}/product.json.ect-orig.1.99.0`)).toBe(false);
  });
});
