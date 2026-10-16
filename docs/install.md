# Install and update

**English** · [简体中文](../zh/docs/install.md)

This page covers installing the extension in VS Code or a compatible editor. The shortest path is in the README's [Get started](../README.md#get-started).

## Check the requirements

VS Code 1.101.0 or newer, or a compatible editor built on it. Nothing else is needed: Port Toolkit reads ports through tools that ship with macOS, Linux and Windows. Checksum Toolkit also needs write access to the editor's installation folder; without it, see [When the installation is not writable](./checksums.md#when-the-installation-is-not-writable).

## Install in VS Code

Search `Editor Console Toolkit` in the Extensions view, or run this in Quick Open (`Ctrl+P`, `Cmd+P` on macOS):

```text
ext install HeavenSky.editor-console-toolkit
```

VS Code keeps the extension up to date unless you have turned off automatic updates.

## Install in another compatible editor

1. Download the `.vsix` from the [latest GitHub release](https://github.com/HeavenSky/editor-console-toolkit/releases).
2. Run Extensions: Install from VSIX… from the Command Palette and pick the file.
3. Repeat with a newer `.vsix` to update.

## Switch the interface language

Commands, settings and messages follow the VS Code display language: English or Simplified Chinese. To switch, run Configure Display Language from the Command Palette.
