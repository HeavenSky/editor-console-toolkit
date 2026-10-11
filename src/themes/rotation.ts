/**
 * 主题轮换的调度与状态: 何时判定, 何时切换, 何时暂停; 宿主能力经 `RotationHost` 注入, 便于单测。
 */
import {
  anchorShift,
  effectiveInterval,
  inRotation,
  type Kind,
  kindOf,
  mustSwitchOnLoad,
  nextBoundary,
  nextInPool,
  parseClock,
  planRotation,
  poolFrom,
  type Pools,
  scheduleKind,
  type Shift,
  slotOf,
} from './core';

export type Appearance = 'keep' | 'system' | 'schedule';

export interface RotationSettings {
  enabled: boolean;
  interval: number;
  darkThemes: string[];
  lightThemes: string[];
  appearance: Appearance;
  lightTime: string;
  darkTime: string;
}

export interface RotationStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export type RotationNotice = 'workspace' | 'autoDetect' | 'missing';

export interface RotationHost {
  now(): number;
  /** 主题(`workbench.colorTheme` 的取值)当前是否已安装。 */
  installed(label: string): boolean;
  settings(): RotationSettings;
  /** 当前生效的 `workbench.colorTheme`. */
  currentTheme(): string | undefined;
  /** 本窗口的主题被工作区设置决定. */
  themeSetByWorkspace(): boolean;
  /** 开启了 `window.autoDetectColorScheme`, 此时写 `workbench.colorTheme` 不生效. */
  autoDetectColorScheme(): boolean;
  focused(): boolean;
  /** VS Code 当前实际显示的明暗, 用于当前主题不在池内时的手动轮换. */
  activeKind(): Kind;
  readSystemKind(): Promise<Kind | undefined>;
  /** 写入用户级 `workbench.colorTheme`. */
  applyTheme(label: string): Promise<void>;
  notify(notice: RotationNotice): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** 各窗口共享的持久状态. */
  state: RotationStore;
}

export const LAST_KEY = 'themes.lastKey';
export const SHIFT_KEY = 'themes.shift';
export const PAUSED_KEY = 'themes.paused';
export const CONFIG_KEY = 'themes.config';

// 定时器在节点之后稍晚触发, 确保按分钟取整的时间表与时段都已进入新值.
const BOUNDARY_MARGIN_MS = 1_000;
// 系统休眠期间定时器的时钟不走, 一次只等这么久, 醒来按真实时钟重算, 避免休眠后切换整体推迟.
export const MAX_WAIT_MS = 5 * 60_000;

export interface Rotation {
  tick(refreshSystem?: boolean): Promise<void>;
  onThemeChanged(): void;
  onSettingsChanged(): void;
  /** 安装或卸载了扩展, 已安装的主题可能变化。 */
  onThemesChanged(): void;
  onFocusChanged(focused: boolean): void;
  nextTheme(): Promise<void>;
  dispose(): void;
}

export function createRotation(host: RotationHost): Rotation {
  const { state } = host;
  let timer: unknown;
  let busy = false;
  /** 判定进行中又有新的触发时, 结束后补跑一次; 值表示补跑时是否需要重新查系统外观. */
  let pending: boolean | undefined;
  /** 本窗口加载后尚未完成第一次判定. */
  let coldStart = true;
  /** 最近一次检查时本窗口的主题是否被工作区设置决定. */
  let overridden = host.themeSetByWorkspace();
  /** 最近一次判定出的明暗, undefined 表示保持当前明暗. */
  let desired: Kind | undefined;
  let systemKind: Kind | undefined;
  let systemSlot: number | undefined;

  const installed = (label: string) => host.installed(label);
  const interval = () => effectiveInterval(host.settings().interval);
  const currentSlot = () => {
    const now = host.now();
    return slotOf(now, interval(), new Date(now).getTimezoneOffset());
  };
  const pools = (): Pools => ({
    dark: poolFrom(host.settings().darkThemes),
    light: poolFrom(host.settings().lightThemes),
  });
  const clocks = () => {
    const { lightTime, darkTime } = host.settings();
    return [parseClock(lightTime ?? ''), parseClock(darkTime ?? '')];
  };

  /** 以 `label` 作为当前时段的主题重算该明暗的轮换偏移, 并标记本时段已处理. */
  async function anchor(label: string, kindForKey: Kind | undefined): Promise<void> {
    const kind = kindOf(label, pools());
    if (!kind) return;
    const slot = currentSlot();
    const shift = anchorShift(pools()[kind], label, slot);
    if (shift !== undefined) {
      await state.update(SHIFT_KEY, { ...state.get<Shift>(SHIFT_KEY), [kind]: shift });
    }
    await state.update(LAST_KEY, `${kindForKey ?? kind}:${slot}`);
  }

  /** 外观要求的明暗; 无法识别系统外观或时间表无效时返回 undefined, 按 `keep` 处理. */
  async function desiredKind(slot: number, refreshSystem: boolean): Promise<Kind | undefined> {
    const { appearance } = host.settings();
    if (appearance === 'system') {
      if (refreshSystem || slot !== systemSlot) {
        systemKind = await host.readSystemKind();
        systemSlot = slot;
      }
      return systemKind;
    }
    if (appearance !== 'schedule') return undefined;
    const [light, dark] = clocks();
    if (light === undefined || dark === undefined) return undefined;
    const now = new Date(host.now());
    return scheduleKind(now.getHours() * 60 + now.getMinutes(), light, dark);
  }

  async function applyTheme(label: string): Promise<void> {
    if (host.autoDetectColorScheme()) return;
    await host.applyTheme(label);
  }

  function clearTimer(): void {
    if (timer !== undefined) host.clearTimer(timer);
    timer = undefined;
  }

  /** 排下一个时间节点; 未开启, 窗口不在前台或主题被工作区设置决定时不排, 由重新获得焦点触发. */
  function schedule(): void {
    clearTimer();
    if (!host.settings().enabled || !host.focused() || host.themeSetByWorkspace()) return;
    const now = host.now();
    const scheduleClocks = host.settings().appearance === 'schedule'
      ? clocks().filter((clock): clock is number => clock !== undefined)
      : [];
    const at = nextBoundary(now, interval(), new Date(now).getTimezoneOffset(), scheduleClocks);
    if (at === undefined) return;
    waitUntil(at + BOUNDARY_MARGIN_MS);
  }

  /** 分段等到 `due`; 中途醒来不能重算节点, 否则正好醒在边界上时会算出再下一个节点而跳过这次切换. */
  function waitUntil(due: number): void {
    timer = host.setTimer(() => {
      timer = undefined;
      if (host.now() >= due) void tick();
      else waitUntil(due);
    }, Math.min(due - host.now(), MAX_WAIT_MS));
  }

  async function tick(refreshSystem = false): Promise<void> {
    if (busy) {
      pending = Boolean(pending) || refreshSystem;
      return;
    }
    if (!host.settings().enabled || !host.focused() || host.themeSetByWorkspace()) {
      clearTimer();
      return;
    }
    busy = true;
    try {
      const slot = currentSlot();
      // 设置或池里已安装的主题与上次处理过的不同(本窗口刚改, 后台期间被改, 装卸了主题)时
      // 按改配置处理: 立即生效.
      const { dark, light } = pools();
      const signature = JSON.stringify([host.settings(), [...dark, ...light].filter(installed)]);
      const configChanged = signature !== state.get<string>(CONFIG_KEY);
      if (configChanged) await state.update(CONFIG_KEY, signature);
      desired = await desiredKind(slot, refreshSystem || configChanged);
      const current = host.currentTheme();
      const loading = coldStart;
      coldStart = false;
      let paused = state.get<boolean>(PAUSED_KEY) ?? false;
      if (paused && configChanged && inRotation(current, pools())) {
        await state.update(PAUSED_KEY, false);
        paused = false;
      }
      if (paused) return;
      if (loading && !mustSwitchOnLoad(current, desired, pools())) {
        // 加载时明暗已符合: 不切换, 只以当前主题为起点重算.
        if (current) await anchor(current, desired);
        return;
      }
      if (configChanged) await state.update(LAST_KEY, undefined);
      const plan = planRotation({
        current,
        pools: pools(),
        desired,
        slot,
        shift: state.get<Shift>(SHIFT_KEY),
        installed,
      });
      if (plan && plan.key !== state.get<string>(LAST_KEY)) {
        if (plan.target === undefined) {
          // 池里的主题一个都没装: 暂停, 装上主题或改配置时重新检查。
          await state.update(PAUSED_KEY, true);
          return;
        }
        await state.update(LAST_KEY, plan.key);
        if (plan.target !== current) await applyTheme(plan.target);
      }
    } catch (error) {
      console.error('[editor-console-toolkit] theme rotation failed', error);
    } finally {
      busy = false;
      if (pending !== undefined) {
        const refresh = pending;
        pending = undefined;
        void tick(refresh);
      } else {
        schedule();
      }
    }
  }

  /**
   * `workbench.colorTheme` 变化: 换到池内主题(手动或自动)以它为起点重算, 已暂停的随之恢复;
   * 换到池外主题则暂停, 设置不变. 主题被工作区设置决定时这类变化来自工作区, 不算手动选择.
   */
  function onThemeChanged(): void {
    // 只由前台窗口处理, 后台窗口在休眠, 也避免它们事后覆盖前台窗口刚写下的标记.
    if (!host.focused()) return;
    const wasOverridden = overridden;
    overridden = host.themeSetByWorkspace();
    if (wasOverridden || overridden) {
      void tick();
      return;
    }
    const label = host.currentTheme();
    if (label !== undefined && inRotation(label, pools())) {
      void state.update(PAUSED_KEY, false).then(() => anchor(label, desired));
    } else {
      void state.update(PAUSED_KEY, true);
    }
  }

  /** 后台窗口不处理, 回到前台时由 `tick` 比对设置签名补上. */
  function onSettingsChanged(): void {
    if (host.focused()) void tick(true);
  }

  function onThemesChanged(): void {
    if (host.focused()) void tick();
  }

  function onFocusChanged(focused: boolean): void {
    if (focused) void tick();
    else clearTimer();
  }

  /** 手动轮到下一个已安装的主题: 当前主题不在池内时, 从与当前明暗相同的池开始. */
  async function nextTheme(): Promise<void> {
    if (host.themeSetByWorkspace()) return host.notify('workspace');
    if (host.autoDetectColorScheme()) return host.notify('autoDetect');
    const current = host.currentTheme();
    const kind = kindOf(current, pools()) ?? host.activeKind();
    const target = nextInPool(pools()[kind], current, installed);
    if (target === undefined) return host.notify('missing');
    if (target !== current) await host.applyTheme(target);
  }

  return { tick, onThemeChanged, onSettingsChanged, onThemesChanged, onFocusChanged, nextTheme, dispose: clearTimer };
}
