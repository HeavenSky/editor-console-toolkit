# Editor Console Toolkit

[English](../README.md) · **简体中文**

> 插件市场页只显示英文版 README；插件界面会跟随 VS Code 的显示语言切换为中文。

一个快捷键给光标处的表达式加上调试日志，提交前一条命令全部关掉；停掉占着开发端口的进程；消掉改过编辑器文件后出现的「安装似乎已损坏」警告。

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/HeavenSky.editor-console-toolkit.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![Installs](https://vsmarketplacebadges.dev/installs-short/HeavenSky.editor-console-toolkit.svg)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](../LICENSE.txt)

这是一个 VS Code 插件，适合习惯用打印语句调试、本机同时跑着好几个服务的开发者。和代码片段不同，生成的日志会按当前语言的写法插到合适的位置，并带一个标记，清理时绝不碰你手写的日志。和在终端里用 `lsof`、`kill` 相比，端口视图直接列出每个进程的工作目录，不用对着 PID 猜哪个是你的。插件没有运行时依赖，也从不联网。

![在 TypeScript 文件里用 Alt+L 插入的调试日志](../media/screenshots/console-log.png)

## 快速开始

1. 从 [VS Code 插件市场](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)安装。其他兼容编辑器见[安装与更新](./docs/install.md)。
2. 把光标放在一个变量上，按 `Alt+L`（macOS 上是 `Option+L`），下一行就出现了可以直接运行的日志：

```js
const user = getUser();
console.log("🎯🎯🎯 [DEBUG] user:", user); // ect:v1
```

## 一键记录光标处的表达式

**日志会落在变量已经有值的位置**：光标在函数签名或 `if` 条件行上时插进块内；块里不能直接放语句时（例如 `switch`），插在这条语句之前；其他情况插在整条语句之后。支持 15 种语言 ID，从 JavaScript、Python 到 Rust、Elixir，也支持多光标。每次执行只占一步撤销，不会保存或格式化文件。详见[插入与清理调试日志](./docs/console-logs.md)。

## 提交前把生成的日志全部关掉

「控制台工具箱：切换全部 Console 日志」会注释掉本插件在当前文件写下的所有日志，再执行一次就恢复。它只处理行尾带 `ect:v1` 标记的行，你自己写的 `console.log` 原样不动。

![执行「切换全部 Console 日志」后，生成的日志全部被注释](../media/screenshots/console-log-toggled.png)

## 停掉占着端口的进程

活动栏里的端口工具箱视图每个监听进程占一行，附带工作目录和完整命令行。同时跑着几个 `node` 时，看 `本工作区` 标记就能认出自己的那个。勾选后一次全部终止；编辑器自身的进程无法勾选。详见[查找并终止占用端口的进程](./docs/ports.md)。

![端口工具箱视图按工作区过滤并展开一行](../media/screenshots/ports.png)

## 消掉「安装似乎已损坏」

改过编辑器自身的文件后，执行「校验和工具箱：修复校验和」，它会重写 `product.json` 里的校验和，完全重启编辑器后警告消失。它会留一份备份供「还原校验和」使用，也从不向你要密码。详见[修复安装已损坏警告](./docs/checksums.md)。

![命令面板中的校验和工具箱命令](../media/screenshots/checksums.png)

## 不适合的场景

控制台工具箱暂不支持 Go、C、C++、shell 以及 Vue、Svelte 单文件组件；主要写这些语言的话，这部分功能用不上。需要断点和监视表达式时，内置调试器更合适。端口工具箱与校验和工具箱目前只在 macOS 上实机验证过。

## 进一步阅读

- [使用文档](./docs/README.md)：完整用法、设置、故障排查与隐私说明。
- 命令与设置清单见插件市场页的 Feature Contributions 标签。
- [更新日志](../CHANGELOG.md)（英文）：各版本的变化。

## 许可证

[MIT](../LICENSE.txt)。校验和工具箱的行为参考了 [vscode-fix-checksums](https://github.com/RimuruChan/vscode-fix-checksums)（MIT © Jürg Lehni 2018，MIT © RimuruChan 2024），未包含其任何代码。
