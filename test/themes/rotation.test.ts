// 主题轮换的调度与状态: 用内存宿主模拟多窗口, 共享状态, 定时器与休眠, 覆盖加载, 暂停, 工作区覆盖与改配置.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Kind } from '../../src/themes/core';
import { createRotation, MAX_WAIT_MS, PAUSED_KEY, type Rotation, type RotationNotice, type RotationSettings } from '../../src/themes/rotation';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const props = Object.fromEntries(
  Object.entries(pkg.contributes.configuration.properties as Record<string, { default: unknown }>).filter(([key]) =>
    key.startsWith('editorConsoleToolkit.themes.')
  )
);
const DARK = props['editorConsoleToolkit.themes.darkThemes'].default as string[];
const LIGHT = props['editorConsoleToolkit.themes.lightThemes'].default as string[];
const MINUTE = 60_000;

const defaults = (): RotationSettings =>
  Object.fromEntries(
    Object.entries(props).map(([key, value]) => [key.replace('editorConsoleToolkit.themes.', ''), value.default]),
  ) as unknown as RotationSettings;

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
};

/** 一台机器: 共享用户设置, 共享 globalState 与时钟, 可开多个窗口. */
class World {
  now: number;
  userTheme: string;
  settings = defaults();
  autoDetect = false;
  /** VS Code 当前实际显示的明暗。 */
  activeKind: Kind = 'dark';
  systemKind: Kind | undefined = 'dark';
  systemQueries = 0;
  writes: string[] = [];
  installed = new Set([...DARK, ...LIGHT, 'Default Dark Modern', 'Default Light Modern']);
  store = new Map<string, unknown>();
  timers: { id: number; at: number; callback: () => void }[] = [];
  windows: Window[] = [];
  private nextId = 1;

  constructor(now: number, theme: string) {
    this.now = now;
    this.userTheme = theme;
  }

  open(focused = true, workspaceTheme?: string): Window {
    for (const window of this.windows) if (focused) window.focused = false;
    const window = new Window(this, focused, workspaceTheme);
    this.windows.push(window);
    return window;
  }

  setTimer(callback: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, at: this.now + ms, callback });
    return id;
  }

  clearTimer(id: unknown): void {
    this.timers = this.timers.filter(timer => timer.id !== id);
  }

  /** 推进真实时钟并按顺序触发到期的定时器. */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      const due = this.timers.filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.now = Math.max(this.now, due.at);
      this.clearTimer(due.id);
      due.callback();
      await flush();
    }
    this.now = end;
    await flush();
  }

  /** 系统休眠: 真实时钟前进, 定时器的时钟不走, 醒来后挂起的定时器按剩余时长继续. */
  async sleep(ms: number): Promise<void> {
    this.now += ms;
    for (const timer of this.timers) timer.at += ms;
    await flush();
  }

  /** 用户在某窗口里改用户级主题; 与 VS Code 一样, 所有窗口都收到配置变化事件. */
  async pickTheme(label: string): Promise<void> {
    this.userTheme = label;
    for (const window of this.windows) window.rotation.onThemeChanged();
    await flush();
  }

  /** 装上或卸载主题扩展; 与 VS Code 一样, 所有窗口都收到扩展变化事件。 */
  async setInstalled(label: string, present: boolean): Promise<void> {
    if (present) this.installed.add(label);
    else this.installed.delete(label);
    for (const window of this.windows) window.rotation.onThemesChanged();
    await flush();
  }

  async changeSettings(patch: Partial<RotationSettings>): Promise<void> {
    Object.assign(this.settings, patch);
    for (const window of this.windows) window.rotation.onSettingsChanged();
    await flush();
  }
}

class Window {
  notices: RotationNotice[] = [];
  rotation: Rotation;

  constructor(
    private world: World,
    public focused: boolean,
    public workspaceTheme?: string,
  ) {
    this.rotation = createRotation({
      now: () => world.now,
      installed: (label) => world.installed.has(label),
      settings: () => ({ ...world.settings }),
      currentTheme: () => this.workspaceTheme ?? world.userTheme,
      themeSetByWorkspace: () => this.workspaceTheme !== undefined,
      autoDetectColorScheme: () => world.autoDetect,
      focused: () => this.focused,
      activeKind: () => world.activeKind,
      readSystemKind: async () => {
        world.systemQueries++;
        return world.systemKind;
      },
      applyTheme: async label => {
        world.writes.push(label);
        if (world.userTheme === label) return;
        world.userTheme = label;
        for (const window of world.windows) window.rotation.onThemeChanged();
      },
      notify: notice => this.notices.push(notice),
      setTimer: (callback, ms) => world.setTimer(callback, ms),
      clearTimer: id => world.clearTimer(id),
      state: {
        get: <T>(key: string) => world.store.get(key) as T | undefined,
        update: async (key, value) => {
          if (value === undefined) world.store.delete(key);
          else world.store.set(key, value);
        },
      },
    });
  }

  async load(): Promise<void> {
    await this.rotation.tick(true);
    await flush();
  }

  async focus(): Promise<void> {
    for (const window of this.world.windows) {
      if (window !== this && window.focused) {
        window.focused = false;
        window.rotation.onFocusChanged(false);
      }
    }
    this.focused = true;
    this.rotation.onFocusChanged(true);
    await flush();
  }

  blur(): void {
    this.focused = false;
    this.rotation.onFocusChanged(false);
  }
}

const at = (h: number, m = 0, day = 12) => new Date(2026, 9, day, h, m).getTime();

describe('加载', () => {
  it('明暗符合时不切换, 以当前主题为起点, 下一个整点轮到它的下一个', async () => {
    const world = new World(at(10, 20), LIGHT[2]);
    await world.open().load();
    expect(world.userTheme).toBe(LIGHT[2]);
    await world.advance(40 * MINUTE);
    expect(world.userTheme).toBe(LIGHT[2]); // 触发点在节点之后 1 秒
    await world.advance(MINUTE);
    expect(world.userTheme).toBe(LIGHT[3]);
    await world.advance(60 * MINUTE);
    expect(world.userTheme).toBe(LIGHT[0]);
  });

  it('明暗不符时立即切换', async () => {
    const world = new World(at(10, 20), DARK[1]);
    await world.open().load();
    expect(LIGHT).toContain(world.userTheme);
  });

  it('到 darkTime 切到深色', async () => {
    const world = new World(at(17, 50), LIGHT[0]);
    await world.open().load();
    await world.advance(11 * MINUTE);
    expect(DARK).toContain(world.userTheme);
  });

  it('池外主题不动', async () => {
    const world = new World(at(10, 20), 'Default Dark Modern');
    await world.open().load();
    await world.advance(3 * 60 * MINUTE);
    expect(world.writes).toEqual([]);
  });
});

describe('定时器', () => {
  it('单次等待不超过 5 分钟', async () => {
    const world = new World(at(10, 1), LIGHT[0]);
    await world.open().load();
    expect(world.timers).toHaveLength(1);
    expect(world.timers[0].at - world.now).toBeLessThanOrEqual(MAX_WAIT_MS);
  });

  it('休眠跨过节点后, 醒来在 5 分钟内按真实时钟补上', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    await world.open().load();
    await world.sleep(2 * 60 * MINUTE); // 12:20 醒来, 错过 11:00 与 12:00
    await world.advance(MAX_WAIT_MS);
    expect(world.userTheme).not.toBe(LIGHT[0]);
    expect(world.writes).toHaveLength(1);
  });

  it('interval 小于 30 时不轮换, 只按时间表切深浅', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    world.settings.interval = 29;
    await world.open().load();
    await world.advance(5 * 60 * MINUTE);
    expect(world.userTheme).toBe(LIGHT[0]);
    await world.advance(3 * 60 * MINUTE); // 18:20
    expect(DARK).toContain(world.userTheme);
  });
});

describe('暂停', () => {
  it('换到池外主题暂停, 换回池内主题恢复并以它为起点', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    await world.open().load();
    await world.pickTheme('Default Light Modern');
    await world.advance(2 * 60 * MINUTE);
    expect(world.writes).toEqual([]);
    await world.pickTheme(LIGHT[1]);
    expect(world.store.get(PAUSED_KEY)).toBe(false);
    await world.advance(60 * MINUTE); // 13:20, 跨过 13:00
    expect(world.userTheme).toBe(LIGHT[2]);
  });

  it('改配置后当前主题已在池内时自动解除暂停', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    world.settings.lightThemes = [LIGHT[0], LIGHT[1]];
    await world.open().load();
    await world.pickTheme(LIGHT[2]);
    expect(world.store.get(PAUSED_KEY)).toBe(true);
    await world.changeSettings({ lightThemes: [LIGHT[0], LIGHT[1], LIGHT[2]] });
    expect(world.store.get(PAUSED_KEY)).toBe(false);
  });

  it('改配置后当前主题仍在池外时保持暂停', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    await world.open().load();
    await world.pickTheme('Default Light Modern');
    await world.changeSettings({ interval: 120 });
    expect(world.store.get(PAUSED_KEY)).toBe(true);
    expect(world.writes).toEqual([]);
  });
});

describe('工作区设置覆盖', () => {
  it('主题由工作区设置决定的窗口不切换, 也不把工作区主题当作手动选择', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    const window = world.open(true, 'Default Dark Modern');
    await window.load();
    await world.advance(3 * 60 * MINUTE);
    expect(world.writes).toEqual([]);
    expect(world.store.get(PAUSED_KEY)).toBeUndefined();
    await window.rotation.nextTheme();
    expect(window.notices).toEqual(['workspace']);
  });

  it('移除工作区设置后恢复', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    const window = world.open(true, LIGHT[3]);
    await window.load();
    window.workspaceTheme = undefined;
    window.rotation.onThemeChanged();
    await flush();
    await world.advance(60 * MINUTE);
    expect(world.writes).toHaveLength(1);
  });
});

describe('多窗口', () => {
  it('只有前台窗口切换, 每个时段只换一次', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    const a = world.open(true);
    await a.load();
    const b = world.open(false);
    await b.load();
    await world.advance(60 * MINUTE);
    expect(world.writes).toEqual([LIGHT[1]]);
    await b.focus();
    await world.advance(MINUTE);
    expect(world.writes).toEqual([LIGHT[1]]);
  });

  it('后台期间被改的设置, 回到前台时生效', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    const window = world.open(true);
    await window.load();
    window.blur();
    await world.changeSettings({ lightThemes: [LIGHT[3], LIGHT[0]] });
    expect(world.writes).toEqual([]);
    await window.focus();
    expect(world.userTheme).toBe(LIGHT[3]);
  });
});

describe('系统外观', () => {
  it('只在进入新时段与改配置时查询, 识别不到时按 keep', async () => {
    const world = new World(at(10, 20), DARK[0]);
    world.settings.appearance = 'system';
    world.systemKind = undefined;
    await world.open().load();
    expect(world.systemQueries).toBe(1);
    expect(world.writes).toEqual([]);
    await world.advance(30 * MINUTE);
    expect(world.systemQueries).toBe(1);
    await world.advance(30 * MINUTE);
    expect(world.systemQueries).toBe(2);
    expect(DARK).toContain(world.userTheme);
  });
});

describe('下一个主题命令', () => {
  it('开启 autoDetectColorScheme 时提示且不写入', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    world.autoDetect = true;
    const window = world.open();
    await window.rotation.nextTheme();
    expect(window.notices).toEqual(['autoDetect']);
    expect(world.writes).toEqual([]);
  });

  it('轮到同类的下一个', async () => {
    const world = new World(at(10, 20), LIGHT[0]);
    const window = world.open();
    await window.rotation.nextTheme();
    expect(world.userTheme).toBe(LIGHT[1]);
  });
});

describe('未安装的主题', () => {
  it('轮到的主题没安装时顺延到池里下一个已安装的', async () => {
    const world = new World(at(10, 20), LIGHT[2]);
    world.installed.delete(LIGHT[3]);
    await world.open().load();
    await world.advance(41 * MINUTE);
    expect(world.userTheme).toBe(LIGHT[0]);
  });

  it('要切去的池一个都没装时暂停, 装上后自动恢复', async () => {
    const world = new World(at(8, 50), DARK[0]);
    for (const label of LIGHT) world.installed.delete(label);
    await world.open().load();
    await world.advance(11 * MINUTE); // 09:01, 该切浅色
    expect(world.writes).toEqual([]);
    expect(world.store.get(PAUSED_KEY)).toBe(true);
    await world.setInstalled(LIGHT[1], true);
    expect(world.store.get(PAUSED_KEY)).toBe(false);
    expect(world.userTheme).toBe(LIGHT[1]);
  });

  it('下一个主题命令在池里都没装时提示', async () => {
    const world = new World(at(10, 20), 'Default Light Modern');
    for (const label of LIGHT) world.installed.delete(label);
    world.activeKind = 'light';
    const window = world.open();
    await window.rotation.nextTheme();
    expect(window.notices).toEqual(['missing']);
    expect(world.writes).toEqual([]);
  });
});
