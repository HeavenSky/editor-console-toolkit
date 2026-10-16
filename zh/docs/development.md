# 从源码构建

[English](../../docs/development.md) · **简体中文**

这页写给想在本地构建、测试或打包插件的贡献者。前提是装好与 `.nvmrc` 一致的 Node.js 及其自带的 npm。

## 构建、测试与打包

```bash
npm ci
npm run check
npm run typecheck
npm test
npm run package
```

`npm run package` 会生成 `artifacts/<name>-<version>.vsix`，并按 `package.json` 核对包内文件。

## 更新截图

`npm run shots`（仅限 macOS）会用独立的配置打开一个新的 VS Code 窗口，逐个演示功能，把压缩后的截图存到 `media/screenshots/`，原尺寸图存到 `artifacts/shots/`。运行期间不要操作这个窗口。它不属于打包和发布流程：界面变化后手动重跑，并把新图和文档一起提交。

## npm 12 与安装脚本

在 npm 12 下，`npm ci` 只接受从 `registry.npmjs.org` 解析的 lockfile，并默认跳过依赖的安装脚本（`esbuild`、`@vscode/vsce-sign`、`fsevents`）。检查、测试和打包都用不到它们。只有本地签名或发布失败时，才用 `npm install-scripts approve <package>` 放行对应的包。
