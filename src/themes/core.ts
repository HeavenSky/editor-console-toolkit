/**
 * 主题轮换的纯逻辑: 轮换池, 时段, 时间节点, 明暗判定与系统外观输出解析; 不依赖 vscode 运行时。
 */

export type Kind = 'dark' | 'light';

/** 轮换池: 每种明暗一份按配置顺序排列的主题名(`workbench.colorTheme` 的取值)。 */
export type Pools = Record<Kind, string[]>;

/** 每种明暗的轮换偏移: 时段 `slot` 从 `池[(slot + 偏移) % 池长]` 起找第一个已安装的主题。 */
export type Shift = Partial<Record<Kind, number>>;

const mod = (value: number, size: number) => ((value % size) + size) % size;

/** 扩展清单 `contributes.themes` 里各主题写进 `workbench.colorTheme` 的名字: 有 `id` 用 `id`, 否则用 `label`。 */
export function themeIdsFromManifest(themes: unknown): string[] {
  if (!Array.isArray(themes)) return [];
  return themes
    .map((theme) => (theme?.id ?? theme?.label) as unknown)
    .filter((id): id is string => typeof id === 'string' && id !== '');
}

/** 配置里的一份主题列表: 只保留非空字符串并按首次出现去重, 顺序即轮换顺序。 */
export function poolFrom(configured: unknown): string[] {
  if (!Array.isArray(configured)) return [];
  return [...new Set(configured.filter((label): label is string => typeof label === 'string' && label !== ''))];
}

/** 主题属于哪个池; 同时出现在两个池里时按深色算。 */
export function kindOf(label: string | undefined, pools: Pools): Kind | undefined {
  if (label === undefined) return undefined;
  if (pools.dark.includes(label)) return 'dark';
  if (pools.light.includes(label)) return 'light';
  return undefined;
}

/** 主题是否在深色或浅色轮换池中; 当前主题在池外即视为暂停轮换。 */
export function inRotation(label: string | undefined, pools: Pools): boolean {
  return kindOf(label, pools) !== undefined;
}

/** 从池的 `start` 位置起(含)循环找第一个已安装的主题; 全都没装时返回 undefined。 */
export function firstInstalled(
  pool: readonly string[],
  start: number,
  installed: (label: string) => boolean
): string | undefined {
  for (let step = 0; step < pool.length; step++) {
    const label = pool[mod(start + step, pool.length)];
    if (installed(label)) return label;
  }
  return undefined;
}

/** 池中 `after` 之后第一个已安装的主题(循环); `after` 不在池中时从头找。 */
export function nextInPool(
  pool: readonly string[],
  after: string | undefined,
  installed: (label: string) => boolean
): string | undefined {
  const index = after === undefined ? -1 : pool.indexOf(after);
  return firstInstalled(pool, index + 1, installed);
}

export const MIN_INTERVAL = 30;
export const MAX_INTERVAL = 14 * 24 * 60;

/** 生效的轮换间隔(分钟): 小于 30 或非法值视为 0(不轮换), 超过两周按两周。 */
export function effectiveInterval(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_INTERVAL) return 0;
  return Math.min(Math.floor(value), MAX_INTERVAL);
}

/**
 * 当前所处的轮换时段编号, 按本地时间对齐(间隔 60 分钟时在整点切换); 间隔 <= 0 时恒为 0。
 *
 * 时段只由时钟决定, 所以同一台机器上的所有窗口算出的时段相同。
 */
export function slotOf(now: number, minutes: number, offsetMinutes: number): number {
  if (!(minutes > 0)) return 0;
  return Math.floor((now / 60_000 - offsetMinutes) / minutes);
}

/**
 * 下一个需要重新判定的时刻(毫秒时间戳): 下一个轮换时段边界与 `clocks` 中各时刻(当天分钟数,
 * 已过则取次日)里最早的一个。间隔 <= 0 且没有时刻时返回 undefined, 表示不需要定时。
 */
export function nextBoundary(
  now: number,
  minutes: number,
  offsetMinutes: number,
  clocks: readonly number[]
): number | undefined {
  const candidates: number[] = [];
  if (minutes > 0) {
    const slot = slotOf(now, minutes, offsetMinutes);
    candidates.push(((slot + 1) * minutes + offsetMinutes) * 60_000);
  }
  for (const clock of clocks) {
    const at = new Date(now);
    at.setHours(Math.floor(clock / 60), clock % 60, 0, 0);
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);
    candidates.push(at.getTime());
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

/**
 * 以 `label` 作为 `slot` 时段的主题反推偏移, 使下一个时段正好轮到池里它的下一个。
 * `label` 不在池中时返回 undefined, 保持原偏移。
 */
export function anchorShift(pool: readonly string[], label: string, slot: number): number | undefined {
  const index = pool.indexOf(label);
  return index < 0 ? undefined : mod(index - slot, pool.length);
}

/** 加载时是否需要立即切换: 只有当前主题在池内且明暗与外观要求不同时才切, 同明暗留到下一个节点。 */
export function mustSwitchOnLoad(current: string | undefined, desired: Kind | undefined, pools: Pools): boolean {
  const kind = kindOf(current, pools);
  return Boolean(kind && desired && kind !== desired);
}

/**
 * 本窗口的主题是否被工作区设置决定。`workbench.colorTheme` 是窗口级设置, 只有用户与工作区两层
 * 生效: 单文件夹窗口的 `.vscode/settings.json` 与多根工作区的 `.code-workspace` 都体现为
 * `workspaceValue`; 多根工作区里各文件夹自己的设置对它不生效, 所以不看 `workspaceFolderValue`。
 */
export function themeSetByWorkspace(inspected: { workspaceValue?: unknown } | undefined): boolean {
  return inspected?.workspaceValue !== undefined;
}

export interface RotationInput {
  /** 当前 `workbench.colorTheme`。 */
  current: string | undefined;
  pools: Pools;
  /** 外观要求的明暗; undefined 表示保持当前明暗。 */
  desired?: Kind;
  slot: number;
  shift?: Shift;
  installed: (label: string) => boolean;
}

export interface Rotation {
  /** 明暗与时段的组合; 与上次处理过的 key 相同时不再切换, 以保留期间的手动选择。 */
  key: string;
  /** 本时段应使用的主题; 当前明暗的池里也没有已安装的主题时为 undefined, 调用方本时段不切换。 */
  target: string | undefined;
}

/**
 * 求当前时段应使用的主题。当前主题不在任何池内时返回 undefined, 不做任何改动。
 *
 * 目标只由明暗, 时段, 偏移, 池与已安装的主题决定而不依赖窗口自己的状态, 多个窗口同时判定得到
 * 同一个主题, 先写入的窗口生效, 其余窗口写入相同值不会再触发切换, 因此每个时段只换一次。
 * 轮到的主题没安装时顺延到池里下一个已安装的主题; 要切去的池一个都没装时保持当前明暗, 在当前池里照常轮换。
 */
export function planRotation({ current, pools, desired, slot, shift = {}, installed }: RotationInput): Rotation | undefined {
  const active = kindOf(current, pools);
  if (!active) return undefined;
  const pick = (kind: Kind) => firstInstalled(pools[kind], slot + (shift[kind] ?? 0), installed);
  const kind = desired ?? active;
  const target = pick(kind);
  if (target === undefined && kind !== active) return { key: `${active}:${slot}`, target: pick(active) };
  return { key: `${kind}:${slot}`, target };
}

/** 解析 `HH:MM` 为当天分钟数, 非法值返回 undefined。 */
export function parseClock(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/**
 * 按时间表判定当前应处的明暗: `[lightStart, darkStart)` 为浅色, 其余为深色, 支持跨午夜。
 * 两个时刻相同时无法区分时段, 返回 undefined。
 */
export function scheduleKind(now: number, lightStart: number, darkStart: number): Kind | undefined {
  if (lightStart === darkStart) return undefined;
  const inLight =
    lightStart < darkStart ? now >= lightStart && now < darkStart : now >= lightStart || now < darkStart;
  return inLight ? 'light' : 'dark';
}

/** macOS: `defaults read -g AppleInterfaceStyle` 在深色下输出 `Dark`, 浅色下该键不存在而报错。 */
export function parseMacAppearance(stdout: string | undefined): Kind {
  return stdout?.trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

/** Windows: `reg query ... /v AppsUseLightTheme` 输出 `0x0` 为深色, `0x1` 为浅色。 */
export function parseWindowsAppearance(stdout: string): Kind | undefined {
  const match = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout);
  if (!match) return undefined;
  return Number.parseInt(match[1], 16) === 0 ? 'dark' : 'light';
}

/** Linux (xdg-desktop-portal): `gdbus call ... Settings.Read org.freedesktop.appearance color-scheme` 输出 `uint32 1` 为深色, `2` 为浅色, `0` 为无偏好。 */
export function parsePortalColorScheme(stdout: string): Kind | undefined {
  const match = /uint32\s+(\d+)/.exec(stdout);
  if (!match) return undefined;
  if (match[1] === '1') return 'dark';
  if (match[1] === '2') return 'light';
  return undefined;
}

/** Linux (GNOME 系): `gsettings get org.gnome.desktop.interface color-scheme`; `default` 等非明确值返回 undefined。 */
export function parseGnomeColorScheme(stdout: string): Kind | undefined {
  const value = stdout.trim().replace(/^'|'$/g, '');
  if (value === 'prefer-dark') return 'dark';
  if (value === 'prefer-light') return 'light';
  return undefined;
}

/** Linux (KDE): `kreadconfig6 --file kdeglobals --group General --key ColorScheme` 输出配色方案名; 未设置时输出为空, 返回 undefined。 */
export function parseKdeColorScheme(stdout: string): Kind | undefined {
  const value = stdout.trim();
  if (value === '') return undefined;
  return /dark/i.test(value) ? 'dark' : 'light';
}

/** 最后的兜底: 按 GTK 主题名是否含 `dark` 判断。 */
export function parseGtkThemeName(stdout: string): Kind {
  return /dark/i.test(stdout) ? 'dark' : 'light';
}
