# Editor Console Toolkit

**English** · [简体中文](./zh/README.md)

Log any expression in one keystroke and switch every generated log off before you commit, stop the process holding your dev port, and silence the editor's "installation appears to be corrupt" warning.

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/HeavenSky.editor-console-toolkit.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![Installs](https://vsmarketplacebadges.dev/installs-short/HeavenSky.editor-console-toolkit.svg)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE.txt)

This VS Code extension is for developers who debug with print statements and run several local servers at once. Unlike a snippet, a generated log knows its language and where it belongs, and carries a marker so cleanup never touches a log you wrote by hand. Unlike `lsof` and `kill` in a terminal, the port view shows each process's working directory, so you do not have to guess which PID is yours. The extension has no runtime dependencies and never goes online.

![Debug logs inserted with Alt+L in a TypeScript file](./media/screenshots/console-log.png)

## Get started

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit). For other compatible editors, see [Install and update](./docs/install.md).
2. Put the cursor on a variable and press `Alt+L` (`Option+L` on macOS). The log appears on the next line, ready to run:

```js
const user = getUser();
console.log("🎯🎯🎯 [DEBUG] user:", user); // ect:v1
```

## Log the expression under your cursor

**The log lands where the value exists**: inside the block when the cursor is on a function signature or an `if` condition line, before the statement when the block cannot hold statements (such as `switch`), and after the statement otherwise. It works in 15 language IDs, from JavaScript and Python to Rust and Elixir, and with multiple cursors. Each run is one undo step, and the file is never saved or reformatted. See [Insert and clean up debug logs](./docs/console-logs.md).

## Switch every generated log off before you commit

Console Toolkit: Toggle All Console Logs comments out every log the extension wrote in the file, and the next run brings them back. Only lines ending in the `ect:v1` marker are touched, so your own `console.log` calls stay as they are.

![Every generated log commented out by Toggle All Console Logs](./media/screenshots/console-log-toggled.png)

## Stop the process that holds your port

The Port Toolkit view in the Activity Bar lists one row per listening process, with its working directory and full command line. A `this workspace` marker tells you which of several `node` processes is yours. Tick rows and terminate them in one go; the editor's own processes cannot be ticked. See [Find and stop processes on your ports](./docs/ports.md).

![Port Toolkit view filtered to the workspace, one row expanded](./media/screenshots/ports.png)

## Silence "installation appears to be corrupt"

After you patch the editor's own files, Checksum Toolkit: Fix Checksums rewrites the checksums in `product.json` so the warning goes away after a full restart. It keeps a backup for Restore Checksums and never asks for your password. See [Fix the corrupt-installation warning](./docs/checksums.md).

![Checksum Toolkit commands in the Command Palette](./media/screenshots/checksums.png)

## When not to use it

Skip it if you work mainly in Go, C, C++, shell or inside Vue and Svelte single-file components: Console Toolkit does not support them yet. For breakpoints and watch expressions, the built-in debugger is the better tool. Port Toolkit and Checksum Toolkit have been verified only on macOS so far.

## Learn more

- [Documentation](./docs/README.md): full usage, settings, troubleshooting and privacy.
- Commands and settings are listed on the marketplace page's Feature Contributions tab.
- [Changelog](./CHANGELOG.md): what changed in each release.

## License

[MIT](./LICENSE.txt). Checksum Toolkit's behaviour is derived from [vscode-fix-checksums](https://github.com/RimuruChan/vscode-fix-checksums) (MIT © Jürg Lehni 2018, MIT © RimuruChan 2024); none of its code is bundled.
