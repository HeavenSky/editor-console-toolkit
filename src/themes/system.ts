import { runCommand } from '../ports/scan/exec';
import type { RunCommand } from '../ports/types';
import {
  type Kind,
  parseGnomeColorScheme,
  parseGtkThemeName,
  parseMacAppearance,
  parseWindowsAppearance,
} from './core';

/**
 * 读取操作系统当前的明暗外观。
 *
 * VS Code 只在开启 `window.autoDetectColorScheme` 时才跟随系统, 扩展 API 也不暴露系统外观,
 * 所以直接调用各平台的命令行查询; 子进程走插件唯一的出口 `runCommand`。
 * 查询失败或平台不支持时返回 undefined, 调用方按 `keep` 处理。
 */
export async function readSystemKind(run: RunCommand = runCommand): Promise<Kind | undefined> {
  const stdout = async (file: string, args: string[]) => {
    try {
      return (await run(file, args)).stdout;
    } catch {
      return undefined;
    }
  };
  switch (process.platform) {
    case 'darwin':
      try {
        return parseMacAppearance((await run('defaults', ['read', '-g', 'AppleInterfaceStyle'])).stdout);
      } catch (error) {
        // 浅色下该键不存在, `defaults` 只往 stderr 报 "does not exist"; 命令缺失或超时才是未知。
        return /does not exist/.test(String(error)) ? 'light' : undefined;
      }
    case 'win32': {
      const out = await stdout('reg', [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
        '/v',
        'AppsUseLightTheme',
      ]);
      return out === undefined ? undefined : parseWindowsAppearance(out);
    }
    case 'linux': {
      const scheme = await stdout('gsettings', ['get', 'org.gnome.desktop.interface', 'color-scheme']);
      const kind = scheme === undefined ? undefined : parseGnomeColorScheme(scheme);
      if (kind) return kind;
      const gtk = await stdout('gsettings', ['get', 'org.gnome.desktop.interface', 'gtk-theme']);
      return gtk === undefined ? undefined : parseGtkThemeName(gtk);
    }
    default:
      return undefined;
  }
}
