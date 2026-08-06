/**
 * Editor Console Toolkit 专属门禁: 钉住各功能域各自的产品承诺。
 *
 * 插件有两个功能域, 承诺不同, 所以禁止清单按目录分级:
 * - console 命令域 (`src/` 下除 `src/ports/`): 纯命令式, 零后台开销 —— 不得有常驻 UI,
 *   监听器, 计时器与磁盘读取;
 * - ports 视图域 (`src/ports/`): 本身就是常驻 TreeView + 轮询刷新, 上述 API 是其实现所需,
 *   因此在该目录放行, 但网络与遥测仍然全局禁止。
 *
 * 分级而不是整体放开, 是为了防止日后无意给 console 命令加上监听器或计时器。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** 任何目录出现都说明引入了外部通信或跨文档副作用。 */
const GLOBAL_FORBIDDEN = [
  'onDidChangeTextDocument',
  'onDidChangeActiveTextEditor',
  'axios',
  'telemetry',
];

/** 只在 console 命令域禁止; ports 视图域按设计需要这些 API。 */
const CONSOLE_ONLY_FORBIDDEN = [
  'createStatusBarItem',
  'createTreeView',
  'registerTreeDataProvider',
  'registerWebviewViewProvider',
  'onDidChangeConfiguration',
  'setInterval',
  'setTimeout',
  'readFileSync',
];

/** 放行 `CONSOLE_ONLY_FORBIDDEN` 的目录, 相对 `src/`。 */
const RELAXED_DIRS = ['ports'];

/**
 * 默认快捷键契约: 只给最高频的 insert 一个默认键, 另两条命令刻意留空由用户自己绑,
 * 因此这里既钉住按键值, 也钉住"不得出现额外绑定".
 */
const EXPECTED_KEYBINDINGS = {
  'editorConsoleToolkit.insertConsoleLog': 'alt+l',
};

const EXPECTED_WHEN = 'editorTextFocus && !editorReadonly';

function collectTsFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...collectTsFiles(path));
    else if (name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/**
 * 该文件是否位于放行目录内。
 *
 * 按路径分段比较而不是字符串前缀: `src/portsomething/` 不应被 `ports` 放行。
 */
function isRelaxed(srcDir, file) {
  const segments = relative(srcDir, file).split(sep);
  return RELAXED_DIRS.includes(segments[0]);
}

export function checks(root) {
  return {
    'src 未使用被禁止的 API': () => {
      const problems = [];
      const srcDir = join(root, 'src');
      for (const file of collectTsFiles(srcDir)) {
        const forbidden = isRelaxed(srcDir, file)
          ? GLOBAL_FORBIDDEN
          : [...GLOBAL_FORBIDDEN, ...CONSOLE_ONLY_FORBIDDEN];
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          for (const api of forbidden) {
            if (line.includes(api)) {
              problems.push(`${file.slice(root.length + 1)}:${index + 1} 使用了被禁止的 ${api}`);
            }
          }
        });
      }
      return problems;
    },

    '清单未出现被禁止项': () => {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const problems = [];
      if (pkg.activationEvents) problems.push('activationEvents 不应存在 (命令与视图贡献点已隐含激活)');
      if (pkg.extensionDependencies) problems.push('extensionDependencies 不应存在');
      if (Object.keys(pkg.dependencies ?? {}).length > 0) problems.push('dependencies 必须为空');
      if ((pkg.contributes?.commands ?? []).some((command) => command.enablement)) {
        problems.push('commands[].enablement 不应存在');
      }
      return problems;
    },

    '默认快捷键与命令一一对应': () => {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const problems = [];
      const bindings = pkg.contributes?.keybindings ?? [];
      const seen = new Set();

      for (const binding of bindings) {
        const expected = EXPECTED_KEYBINDINGS[binding.command];
        if (!expected) {
          problems.push(`keybindings 出现契约外的绑定: ${binding.command}`);
          continue;
        }
        if (seen.has(binding.command)) problems.push(`keybindings 重复绑定: ${binding.command}`);
        seen.add(binding.command);
        if (binding.key !== expected) {
          problems.push(`${binding.command} 的按键应为 ${expected}, 实际 ${binding.key}`);
        }
        if (binding.when !== EXPECTED_WHEN) {
          problems.push(`${binding.command} 的 when 应为 ${EXPECTED_WHEN}, 实际 ${binding.when}`);
        }
      }

      for (const command of Object.keys(EXPECTED_KEYBINDINGS)) {
        if (!seen.has(command)) problems.push(`命令缺少默认快捷键: ${command}`);
      }

      // 每条快捷键都必须指向真实注册的命令, 否则按下去是空操作。
      const declared = new Set((pkg.contributes?.commands ?? []).map((command) => command.command));
      for (const command of Object.keys(EXPECTED_KEYBINDINGS)) {
        if (!declared.has(command)) problems.push(`contributes.commands 缺少命令: ${command}`);
      }
      return problems;
    },
  };
}
