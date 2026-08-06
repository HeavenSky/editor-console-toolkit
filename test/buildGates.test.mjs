import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checks } from '../scripts/check-extra.mjs';
import { deriveAllowlist } from '../scripts/lib/vsix-allowlist.mjs';

/**
 * 门禁自身的测试。
 *
 * 门禁漏判不会让构建失败, 只会静默放过它本该拦住的东西, 所以这两条推导规则必须有断言:
 * 目录白名单必须真的按目录区分, 允许清单必须涵盖视图容器图标。
 *
 * 用 `.mjs` 而不是 `.ts`: `tsconfig.json` 没开 `allowJs`, 从 `.ts` 里 import 这两个
 * 构建脚本会让 `tsc --noEmit` 报缺声明文件。
 */

const FIXTURE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/gates');

/** 只取 API 检查的结果; 清单类检查在下面单独断言。 */
const apiProblems = () => checks(FIXTURE_ROOT)['src 未使用被禁止的 API']();

describe('check-extra 的目录白名单', () => {
  it('在 console 命令域报告 CONSOLE_ONLY_FORBIDDEN', () => {
    const hits = apiProblems().filter((p) => p.startsWith('src/commands/a.ts'));
    expect(hits.some((p) => p.includes('setInterval'))).toBe(true);
  });

  it('在 ports 视图域放行 CONSOLE_ONLY_FORBIDDEN', () => {
    const hits = apiProblems().filter((p) => p.startsWith('src/ports/'));
    expect(hits.some((p) => p.includes('setInterval'))).toBe(false);
  });

  it('两个目录都报告 GLOBAL_FORBIDDEN', () => {
    const problems = apiProblems();
    expect(problems.some((p) => p.startsWith('src/commands/a.ts') && p.includes('axios'))).toBe(true);
    expect(problems.some((p) => p.startsWith('src/ports/view/p.ts') && p.includes('axios'))).toBe(true);
  });

  it('按路径分段放行, 不按字符串前缀', () => {
    // src/portsy/ 只是名字以 ports 开头, 不应被 src/ports 的放行规则覆盖。
    const hits = apiProblems().filter((p) => p.startsWith('src/portsy/q.ts'));
    expect(hits.some((p) => p.includes('setInterval'))).toBe(true);
  });
});

describe('check-extra 的清单检查', () => {
  it('fixture 清单满足快捷键契约, 因此不污染上面的断言', () => {
    expect(checks(FIXTURE_ROOT)['默认快捷键与命令一一对应']()).toEqual([]);
  });

  it('不再禁止 views / viewsContainers / menus', () => {
    expect(checks(FIXTURE_ROOT)['清单未出现被禁止项']()).toEqual([]);
  });
});

describe('deriveAllowlist', () => {
  const base = {
    pkg: { main: './out/extension.js', icon: 'media/icon.png' },
    rootEntries: ['package.json', 'README.md', 'LICENSE.txt'],
    l10nEntries: [],
  };

  it('收录视图容器图标', () => {
    const allowed = deriveAllowlist({
      ...base,
      pkg: {
        ...base.pkg,
        contributes: {
          viewsContainers: { activitybar: [{ id: 'x', title: 'X', icon: 'media/ports.svg' }] },
        },
      },
    });
    expect(allowed.has('media/ports.svg')).toBe(true);
  });

  it('没有 viewsContainers 时不产生多余条目', () => {
    expect([...deriveAllowlist(base)].sort()).toEqual([
      'LICENSE.txt',
      'media/icon.png',
      'out/extension.js',
      'package.json',
      'readme.md',
    ]);
  });

  it('l10n 目录下的文件按 pkg.l10n 前缀收录', () => {
    const allowed = deriveAllowlist({
      ...base,
      pkg: { ...base.pkg, l10n: './l10n' },
      l10nEntries: ['bundle.l10n.zh-cn.json'],
    });
    expect(allowed.has('l10n/bundle.l10n.zh-cn.json')).toBe(true);
  });
});
