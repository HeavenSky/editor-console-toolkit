/**
 * Editor Console Toolkit 专属门禁: 保证产物里没有常驻 UI, 后台监听, 磁盘读取, 网络与遥测。
 *
 * 这是本插件的产品承诺 (纯命令式, 零后台开销), 因此用静态负向检查钉住,
 * 而不是靠 review 记得。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 一旦出现就说明引入了常驻开销或外部通信。 */
const FORBIDDEN_APIS = [
  'createStatusBarItem',
  'createTreeView',
  'registerTreeDataProvider',
  'registerWebviewViewProvider',
  'onDidChangeTextDocument',
  'onDidChangeActiveTextEditor',
  'onDidChangeConfiguration',
  'setInterval',
  'setTimeout',
  'readFileSync',
  'axios',
  'telemetry',
];

/** 清单里一旦出现就说明插件不再是"纯命令式". */
const FORBIDDEN_MANIFEST_KEYS = ['views', 'viewsContainers', 'menus'];

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

export function checks(root) {
  return {
    'src 未使用被禁止的 API': () => {
      const problems = [];
      for (const file of collectTsFiles(join(root, 'src'))) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          for (const api of FORBIDDEN_APIS) {
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
      for (const key of FORBIDDEN_MANIFEST_KEYS) {
        if (pkg.contributes?.[key]) problems.push(`contributes.${key} 不应存在`);
      }
      if (pkg.activationEvents) problems.push('activationEvents 不应存在 (命令贡献点已隐含激活)');
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
