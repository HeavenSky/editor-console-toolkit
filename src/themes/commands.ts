import * as vscode from 'vscode';

import { type Kind, themeIdsFromManifest, themeSetByWorkspace } from './core';
import { createRotation, type RotationNotice, type RotationSettings } from './rotation';
import { readSystemKind } from './system';

/**
 * 主题轮换的 VS Code 边界: 把 API 接到 `createRotation` 的宿主接口上。
 *
 * 轮换池完全由配置决定, 可以是任何扩展提供的主题; 写入前按已安装扩展贡献的主题检查是否存在。
 * 远端扩展宿主(SSH, WSL, 容器)里的时钟, 时区与系统外观都属于远端机器, 所以只在本机窗口里轮换,
 * 远端窗口视同休眠, 由本机窗口负责。
 */

const SECTION = 'editorConsoleToolkit.themes';

/**
 * 所有已安装扩展(含内置)贡献的颜色主题, 按写进 `workbench.colorTheme` 的名字收集。
 * `packageJSON` 里的 `%占位符%` label 已由 VS Code 按显示语言翻译, 与设置里认的名字一致。
 */
function installedThemes(): Set<string> {
  return new Set(vscode.extensions.all.flatMap((extension) => themeIdsFromManifest(extension.packageJSON?.contributes?.themes)));
}

export function registerThemeRotation(context: vscode.ExtensionContext): void {
  const workbench = () => vscode.workspace.getConfiguration('workbench');
  const local = vscode.env.remoteName === undefined;
  let installed = installedThemes();

  const messages: Record<RotationNotice, () => string> = {
    workspace: () =>
      vscode.l10n.t(
        "This window's color theme is set by workspace settings (workbench.colorTheme), so Theme Toolkit does not switch themes here."
      ),
    autoDetect: () =>
      vscode.l10n.t(
        'window.autoDetectColorScheme is enabled, so VS Code ignores workbench.colorTheme and Theme Toolkit cannot switch themes.'
      ),
    missing: () =>
      vscode.l10n.t('None of the themes configured for Theme Toolkit is installed.'),
  };

  const rotation = createRotation({
    now: () => Date.now(),
    installed: (label) => installed.has(label),
    settings: () => {
      // 不传默认值: 取清单里声明的默认值, 两处各写一份会漂移。
      const config = vscode.workspace.getConfiguration(SECTION);
      return {
        enabled: config.get('enabled'),
        interval: config.get('interval'),
        darkThemes: config.get('darkThemes'),
        lightThemes: config.get('lightThemes'),
        appearance: config.get('appearance'),
        lightTime: config.get('lightTime'),
        darkTime: config.get('darkTime'),
      } as RotationSettings;
    },
    currentTheme: () => {
      const inspected = workbench().inspect<string>('colorTheme');
      return inspected?.globalValue ?? inspected?.defaultValue;
    },
    themeSetByWorkspace: () => themeSetByWorkspace(workbench().inspect<string>('colorTheme')),
    autoDetectColorScheme: () =>
      vscode.workspace.getConfiguration('window').get<boolean>('autoDetectColorScheme') === true,
    focused: () => local && vscode.window.state.focused,
    activeKind: (): Kind => {
      const kind = vscode.window.activeColorTheme.kind;
      return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
        ? 'light'
        : 'dark';
    },
    readSystemKind: () => readSystemKind(),
    applyTheme: async (label) => {
      await workbench().update('colorTheme', label, vscode.ConfigurationTarget.Global);
    },
    notify: (notice) => void vscode.window.showInformationMessage(messages[notice]()),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    state: context.globalState,
  });

  context.subscriptions.push(
    { dispose: rotation.dispose },
    vscode.commands.registerCommand('editorConsoleToolkit.themes.next', rotation.nextTheme),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('workbench.colorTheme')) rotation.onThemeChanged();
      if (event.affectsConfiguration(SECTION)) rotation.onSettingsChanged();
    }),
    vscode.window.onDidChangeWindowState((state) => rotation.onFocusChanged(state.focused)),
    vscode.extensions.onDidChange(() => {
      installed = installedThemes();
      rotation.onThemesChanged();
    })
  );

  void rotation.tick(true);
}
