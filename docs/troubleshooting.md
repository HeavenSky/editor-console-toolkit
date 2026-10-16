# Troubleshooting

**English** · [简体中文](../zh/docs/troubleshooting.md)

This page maps the messages and symptoms you may see to their cause and fix. Each entry is written as symptom → cause → fix; search this page for the exact text you see.

## Console Toolkit

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Alt+L` does nothing | The key only fires in a writable editor with focus, or another binding takes it | In Keyboard Shortcuts, search `alt+l` and resolve the conflict |
| "Console Toolkit does not support this language yet." | The file's language has no adapter | See the [supported languages](./console-logs.md#supported-languages) |
| "Select a single-line expression." | The selection spans more than one line | Select within one line, or clear the selection |
| "Place the cursor on an expression, not inside a comment." | The cursor is in a comment or block comment | Move the cursor onto code |
| "Place the cursor on an expression, not inside a string." | The cursor is in a string, template literal or triple-quoted string | Move the cursor outside the literal |
| "Nothing to log at the cursor." | No expression under the cursor | Put the cursor on a name, or select the expression |
| "Cannot find a safe place to insert the log." | Unbalanced brackets, an unterminated string, or a statement longer than 50 lines | Fix the syntax, or select a shorter expression |
| "No Console Toolkit logs in this file." | Toggle All found no line with the `ect:v1` marker | Nothing to do; hand-written logs are never toggled |
| A log will not toggle off | It has no `ect:v1` marker, or it no longer sits right next to its anchor line | Delete it by hand |

## Port Toolkit

| Symptom | Cause | Fix |
| --- | --- | --- |
| The view is empty | Every listener is classified as a system process | Run Toggle System Processes, or lower `editorConsoleToolkit.ports.systemPortMax` |
| A row shows "the editor itself" or "another user, needs elevation" and has no checkbox | The process belongs to your editor or to another user | Stop it outside the editor; the extension never elevates privileges |
| "Port scan failed" row | The OS refused the port lookup | Read the reason in the row; on Linux some details need root |
| "… changed since you checked it, skipped." | The PID now runs a different command | Refresh and tick the row again if you still want it stopped |
| The list looks stale | The view only refreshes while visible, or `refreshInterval` is `0` | Click Refresh Ports, or set a non-zero interval |

## Checksum Toolkit

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Installation appears to be corrupt" survives Fix Checksums | The window was only reloaded | Quit the editor completely and start it again |
| The warning comes back later | An editor update replaced `product.json` | Run Fix Checksums again |
| "No write access to the editor installation. …" | The installation folder needs administrator rights | Use Copy command and run it in an elevated terminal, then restart |
| "Checksums can only be fixed from a local desktop window." | You are in a Remote window or on the web | Run it from a local desktop window |
| "No backup written by this extension was found, so there is nothing to restore." | Fix Checksums never wrote a backup for this installation | Reinstall the editor to get the original `product.json` |
