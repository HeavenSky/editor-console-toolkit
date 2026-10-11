import { afterEach, describe, expect, it } from 'vitest';

import type { RunCommand } from '../../src/ports/types';
import { readSystemKind } from '../../src/themes/system';

/**
 * 用假的子进程出口断言各平台命令输出到明暗的映射; 平台经 `process.platform` 替换, 不真实执行命令。
 */

const platform = process.platform;
const setPlatform = (value: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value });

afterEach(() => setPlatform(platform));

const replying =
  (reply: (file: string, args: string[]) => string | Error): RunCommand =>
  async (file, args) => {
    const result = reply(file, args);
    if (result instanceof Error) throw result;
    return { stdout: result, stderr: '', code: 0 };
  };

describe('readSystemKind', () => {
  it('macOS 深色输出 Dark', async () => {
    setPlatform('darwin');
    expect(await readSystemKind(replying(() => 'Dark\n'))).toBe('dark');
  });

  it('macOS 浅色时键不存在, 视为浅色', async () => {
    setPlatform('darwin');
    const missingKey = new Error(
      'defaults 执行失败: The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist'
    );
    expect(await readSystemKind(replying(() => missingKey))).toBe('light');
  });

  it('macOS 命令缺失或超时时为未知', async () => {
    setPlatform('darwin');
    expect(await readSystemKind(replying(() => new Error('defaults 执行失败: spawn defaults ENOENT')))).toBeUndefined();
  });

  it('Windows 读注册表', async () => {
    setPlatform('win32');
    const out = '    AppsUseLightTheme    REG_DWORD    0x0\r\n';
    expect(await readSystemKind(replying(() => out))).toBe('dark');
  });

  it('GNOME 的 color-scheme 为 default 时按 gtk-theme 名称判断', async () => {
    setPlatform('linux');
    const run = replying((_, args) => (args.includes('color-scheme') ? "'default'\n" : "'Adwaita-dark'\n"));
    expect(await readSystemKind(run)).toBe('dark');
  });

  it('不支持的平台为未知', async () => {
    setPlatform('freebsd');
    expect(await readSystemKind(replying(() => 'Dark'))).toBeUndefined();
  });
});
