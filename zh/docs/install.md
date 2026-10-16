# 安装与更新

[English](../../docs/install.md) · **简体中文**

这页说明如何在 VS Code 或兼容的编辑器里安装插件。最短路径见 README 的[快速开始](../README.md#快速开始)。

## 确认环境要求

VS Code 1.101.0 或更高版本，或基于它的兼容编辑器。其他什么都不用装：端口工具箱读取端口用的是 macOS、Linux 和 Windows 自带的工具。校验和工具箱还需要编辑器安装目录的写权限；没有权限时见[安装目录不可写时](./checksums.md#安装目录不可写时)。

## 在 VS Code 里安装

在扩展视图搜索 `Editor Console Toolkit`，或在快速打开（`Ctrl+P`，macOS 上是 `Cmd+P`）里执行：

```text
ext install HeavenSky.editor-console-toolkit
```

VS Code 会自动更新插件，除非你关掉了自动更新。

## 在其他兼容编辑器里安装

1. 从 [GitHub Releases 页面](https://github.com/HeavenSky/editor-console-toolkit/releases) 下载最新的 `.vsix`。
2. 在命令面板执行 Extensions: Install from VSIX…（中文界面为「扩展: 从 VSIX 安装...」），选中下载的文件。
3. 更新时换用新版 `.vsix` 重复上述步骤。

## 切换界面语言

命令、设置和提示信息跟随 VS Code 的显示语言，提供英文与简体中文。要切换，在命令面板执行「配置显示语言」（Configure Display Language）。
