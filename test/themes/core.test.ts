import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  anchorShift,
  effectiveInterval,
  firstInstalled,
  inRotation,
  kindOf,
  mustSwitchOnLoad,
  nextBoundary,
  nextInPool,
  parseClock,
  parseGnomeColorScheme,
  parseGtkThemeName,
  parseKdeColorScheme,
  parseMacAppearance,
  parsePortalColorScheme,
  parseWindowsAppearance,
  planRotation,
  poolFrom,
  scheduleKind,
  slotOf,
  themeIdsFromManifest,
  themeSetByWorkspace,
} from '../../src/themes/core';

/**
 * 主题轮换的纯逻辑: 轮换池, 已安装检查, 时段与时间节点, 切换决策, 时间表与各平台外观输出解析。
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const props = pkg.contributes.configuration.properties;

const pools = { dark: ['d0', 'd1', 'd2', 'd3'], light: ['l0', 'l1', 'l2', 'l3'] };
const all = () => true;
const except =
  (...missing: string[]) =>
  (label: string) =>
    !missing.includes(label);

describe('设置', () => {
  it('默认时刻能被解析', () => {
    expect(parseClock(props['editorConsoleToolkit.themes.lightTime'].default)).toBe(9 * 60);
    expect(parseClock(props['editorConsoleToolkit.themes.darkTime'].default)).toBe(18 * 60);
  });

  it('轮换池是任意主题名的列表, 不限定枚举', () => {
    for (const kind of ['dark', 'light']) {
      const prop = props[`editorConsoleToolkit.themes.${kind}Themes`];
      expect(prop.items).toEqual({ type: 'string' });
      expect(prop.default.length).toBeGreaterThan(0);
    }
  });
});

describe('themeIdsFromManifest', () => {
  it('有 id 用 id, 否则用 label, 丢弃非法条目', () => {
    const themes = [
      { id: 'Default Dark Modern', label: '%darkModern%' },
      { label: 'Comfort One Dark' },
      { label: '' },
      {},
      null,
    ];
    expect(themeIdsFromManifest(themes)).toEqual(['Default Dark Modern', 'Comfort One Dark']);
    expect(themeIdsFromManifest(undefined)).toEqual([]);
  });
});

describe('poolFrom 与 kindOf', () => {
  it('只保留非空字符串并按首次出现去重', () => {
    expect(poolFrom(['a', 'b', 'a', '', 3, null, 'c'])).toEqual(['a', 'b', 'c']);
    expect(poolFrom(undefined)).toEqual([]);
  });

  it('按所在的池判明暗, 两个池都有时按深色', () => {
    expect(kindOf('l1', pools)).toBe('light');
    expect(kindOf('x', pools)).toBeUndefined();
    expect(kindOf('both', { dark: ['both'], light: ['both'] })).toBe('dark');
    expect(inRotation('d2', pools)).toBe(true);
    expect(inRotation(undefined, pools)).toBe(false);
  });
});

describe('firstInstalled 与 nextInPool', () => {
  it('跳过没安装的主题, 循环找下一个', () => {
    expect(firstInstalled(['a', 'b', 'c'], 1, except('b'))).toBe('c');
    expect(firstInstalled(['a', 'b', 'c'], 2, except('c'))).toBe('a');
    expect(firstInstalled(['a', 'b'], 5, all)).toBe('b');
  });

  it('全都没装或池为空时为 undefined', () => {
    expect(firstInstalled(['a', 'b'], 0, () => false)).toBeUndefined();
    expect(firstInstalled([], 0, all)).toBeUndefined();
  });

  it('nextInPool 取下一个已安装的主题, 不在池中时从头找', () => {
    expect(nextInPool(['a', 'b', 'c'], 'a', except('b'))).toBe('c');
    expect(nextInPool(['a', 'b', 'c'], 'c', all)).toBe('a');
    expect(nextInPool(['a', 'b'], 'x', all)).toBe('a');
    expect(nextInPool(['a', 'b'], undefined, all)).toBe('a');
  });
});

describe('effectiveInterval', () => {
  it('小于 30 或非法值视为 0', () => {
    for (const value of [-5, 0, 1, 29, 29.9, Number.NaN, Number.POSITIVE_INFINITY, '60', undefined]) {
      expect(effectiveInterval(value)).toBe(0);
    }
  });

  it('30 到两周之间取整数分钟, 超过两周按两周', () => {
    expect(effectiveInterval(30)).toBe(30);
    expect(effectiveInterval(90.7)).toBe(90);
    expect(effectiveInterval(14 * 24 * 60)).toBe(20160);
    expect(effectiveInterval(1e9)).toBe(20160);
  });
});

describe('slotOf', () => {
  const hour = 3_600_000;
  it('按本地时钟对齐: 同一小时内时段相同, 整点进入下一个', () => {
    // UTC+8 时 getTimezoneOffset() 为 -480
    const base = 1_000 * hour;
    expect(slotOf(base, 60, -480)).toBe(slotOf(base + hour - 1, 60, -480));
    expect(slotOf(base + hour, 60, -480)).toBe(slotOf(base, 60, -480) + 1);
  });

  it('间隔为 0 或非法时恒为 0', () => {
    expect(slotOf(123_456_789, 0, 0)).toBe(0);
    expect(slotOf(123_456_789, Number.NaN, 0)).toBe(0);
  });
});

describe('nextBoundary', () => {
  const local = (h: number, m = 0, day = 11) => new Date(2026, 9, day, h, m).getTime();
  const next = (now: number, minutes: number, clocks: number[]) =>
    nextBoundary(now, minutes, new Date(now).getTimezoneOffset(), clocks);

  it('只有间隔时取下一个整点', () => {
    expect(next(local(8, 30), 60, [])).toBe(local(9));
    expect(next(local(9), 60, [])).toBe(local(10));
  });

  it('时间表时刻早于时段边界时取时刻', () => {
    expect(next(local(8, 30), 120, [9 * 60 + 15, 18 * 60])).toBe(local(9, 15));
  });

  it('当天时刻已过时取次日', () => {
    expect(next(local(20), 0, [9 * 60, 18 * 60])).toBe(local(9, 0, 12));
  });

  it('间隔为 0 且没有时刻时不定时', () => {
    expect(next(local(8), 0, [])).toBeUndefined();
  });
});

describe('planRotation', () => {
  const base = { pools, slot: 0, installed: all };

  it('当前主题不在任何池内时不切换', () => {
    expect(planRotation({ ...base, current: 'Default Dark Modern', desired: 'light' })).toBeUndefined();
    expect(planRotation({ ...base, current: undefined })).toBeUndefined();
  });

  it('按时段在池里依次轮换并循环', () => {
    const at = (slot: number) => planRotation({ ...base, current: 'd0', slot })?.target;
    expect([0, 1, 2, 3, 4].map(at)).toEqual(['d0', 'd1', 'd2', 'd3', 'd0']);
  });

  it('未指定明暗时保持当前明暗, 指定时切到对应的池', () => {
    expect(planRotation({ ...base, current: 'l2', slot: 1 })).toEqual({ key: 'light:1', target: 'l1' });
    expect(planRotation({ ...base, current: 'l2', desired: 'dark', slot: 1 })).toEqual({ key: 'dark:1', target: 'd1' });
  });

  it('轮到的主题没安装时顺延到下一个已安装的', () => {
    expect(planRotation({ ...base, current: 'd0', slot: 1, installed: except('d1', 'd2') })?.target).toBe('d3');
  });

  it('要切去的池一个都没装时保持当前明暗, 在当前池里轮换', () => {
    const missingLight = (label: string) => !label.startsWith('l');
    expect(planRotation({ ...base, current: 'd0', desired: 'light', slot: 1, installed: missingLight })).toEqual({
      key: 'dark:1',
      target: 'd1',
    });
  });

  it('当前池也没装时 target 为 undefined', () => {
    expect(planRotation({ ...base, current: 'd0', installed: () => false })).toEqual({ key: 'dark:0', target: undefined });
  });

  it('以当前主题为起点重算后, 本时段保持当前主题, 下一个时段轮到它的下一个', () => {
    const shift = { dark: anchorShift(pools.dark, 'd2', 100) };
    expect(planRotation({ ...base, current: 'd2', slot: 100, shift })?.target).toBe('d2');
    expect(planRotation({ ...base, current: 'd2', slot: 101, shift })?.target).toBe('d3');
    expect(planRotation({ ...base, current: 'd2', slot: 102, shift })?.target).toBe('d0');
  });

  it('多个窗口在同一时段得到相同的 key 与主题, 因此只换一次', () => {
    const windowA = planRotation({ ...base, current: 'd0', desired: 'dark', slot: 7 });
    const windowB = planRotation({ ...base, current: windowA?.target, desired: 'dark', slot: 7 });
    expect(windowB).toEqual(windowA);
  });
});

describe('anchorShift', () => {
  it('当前主题不在池中时不重算偏移', () => {
    expect(anchorShift(['a', 'b'], 'x', 5)).toBeUndefined();
    expect(anchorShift(['a', 'b', 'c'], 'a', 5)).toBe(1);
  });
});

describe('mustSwitchOnLoad', () => {
  it('明暗不同时立即切换, 相同或保持当前明暗时不切换', () => {
    expect(mustSwitchOnLoad('d1', 'light', pools)).toBe(true);
    expect(mustSwitchOnLoad('d1', 'dark', pools)).toBe(false);
    expect(mustSwitchOnLoad('d1', undefined, pools)).toBe(false);
  });

  it('池外主题不切换', () => {
    expect(mustSwitchOnLoad('Default Dark Modern', 'light', pools)).toBe(false);
  });
});

describe('themeSetByWorkspace', () => {
  it('只有用户级或默认值时不算', () => {
    expect(themeSetByWorkspace(undefined)).toBe(false);
    expect(themeSetByWorkspace({ workspaceValue: undefined })).toBe(false);
  });

  it('工作区设置了主题时算', () => {
    expect(themeSetByWorkspace({ workspaceValue: 'Comfort Ayu Dark' })).toBe(true);
  });

  it('多根工作区里仅某个文件夹设置了主题时不算, 因为它对窗口级设置不生效', () => {
    expect(themeSetByWorkspace({ workspaceFolderValue: 'One Light Fit' } as { workspaceValue?: unknown })).toBe(false);
  });
});

describe('parseClock', () => {
  it.each([
    ['00:00', 0],
    ['07:05', 425],
    ['23:59', 1439],
  ])('%s', (value, minutes) => {
    expect(parseClock(value)).toBe(minutes);
  });

  it.each(['24:00', '7:00', '07:60', '', 'abc'])('非法值 %j', (value) => {
    expect(parseClock(value)).toBeUndefined();
  });
});

describe('scheduleKind', () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it('白天浅色, 夜间深色', () => {
    expect(scheduleKind(at(8, 59), at(9), at(18))).toBe('dark');
    expect(scheduleKind(at(9), at(9), at(18))).toBe('light');
    expect(scheduleKind(at(17, 59), at(9), at(18))).toBe('light');
    expect(scheduleKind(at(18), at(9), at(18))).toBe('dark');
  });

  it('浅色时段跨午夜', () => {
    expect(scheduleKind(at(23), at(22), at(6))).toBe('light');
    expect(scheduleKind(at(3), at(22), at(6))).toBe('light');
    expect(scheduleKind(at(12), at(22), at(6))).toBe('dark');
  });

  it('两个时刻相同时无法判定', () => {
    expect(scheduleKind(at(12), at(8), at(8))).toBeUndefined();
  });
});

describe('系统外观解析', () => {
  it('macOS', () => {
    expect(parseMacAppearance('Dark\n')).toBe('dark');
    expect(parseMacAppearance(undefined)).toBe('light');
  });

  it('Windows', () => {
    const out = (v: string) => `\r\nHKEY_CURRENT_USER\\...\\Personalize\r\n    AppsUseLightTheme    REG_DWORD    ${v}\r\n`;
    expect(parseWindowsAppearance(out('0x0'))).toBe('dark');
    expect(parseWindowsAppearance(out('0x1'))).toBe('light');
    expect(parseWindowsAppearance('')).toBeUndefined();
  });

  it('GNOME', () => {
    expect(parseGnomeColorScheme("'prefer-dark'\n")).toBe('dark');
    expect(parseGnomeColorScheme("'prefer-light'\n")).toBe('light');
    expect(parseGnomeColorScheme("'default'\n")).toBeUndefined();
    expect(parseGtkThemeName("'Adwaita-dark'\n")).toBe('dark');
    expect(parseGtkThemeName("'Adwaita'\n")).toBe('light');
  });

  it('xdg portal', () => {
    expect(parsePortalColorScheme('(<<uint32 1>>,)\n')).toBe('dark');
    expect(parsePortalColorScheme('(<<uint32 2>>,)\n')).toBe('light');
    expect(parsePortalColorScheme('(<<uint32 0>>,)\n')).toBeUndefined();
    expect(parsePortalColorScheme('')).toBeUndefined();
  });

  it('KDE', () => {
    expect(parseKdeColorScheme('BreezeDark\n')).toBe('dark');
    expect(parseKdeColorScheme('BreezeLight\n')).toBe('light');
    expect(parseKdeColorScheme('\n')).toBeUndefined();
  });
});
