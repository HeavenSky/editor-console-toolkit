# Fix the corrupt-installation warning

**English** · [简体中文](../zh/docs/checksums.md)

This page shows how to remove the "Your installation appears to be corrupt" warning after you patch the editor's own files, and how to undo it. You need a local desktop window; the commands refuse to run in Remote (SSH, WSL, container) windows and on the web.

## Fix the checksums

Run Fix Checksums, then fully restart the editor: the warning and `[Unsupported]` in the title bar are gone.

1. Run Checksum Toolkit: Fix Checksums from the Command Palette. A notification reports how many checksums were fixed.
2. **Quit the editor completely and start it again**; reloading the window is not enough.
3. After every editor update, run the command again: an update replaces `product.json` and the warning returns.

The warning appears because the checksums recorded in the editor's `product.json` no longer match the files on disk. The command recomputes the SHA-256 of every file listed under `checksums` and writes back only the entries that differ. Files that no longer exist are skipped and reported; when nothing differs, nothing is written.

## Know what is changed on disk

Before the first write, `product.json` is copied to `product.json.ect-orig.<version>` beside it, and later runs never overwrite that copy. The new content is written to a temporary file in the same folder and then renamed over `product.json`, so an interrupted run cannot leave a truncated or missing file.

The first fix also reformats `product.json`, which grows by about 4 KB; the data is equivalent, and the byte-exact original is in the backup. Running either command deletes backups left by other editor versions, but only files named `product.json.ect-orig.*`.

## Undo the fix

Run Checksum Toolkit: Restore Checksums, then quit and restart the editor. It writes the backup back and only then deletes it.

Restore returns to the state before this extension's first fix, not to a factory-fresh `product.json`: if another tool had patched the checksums earlier, that is what the backup holds. With no backup left, reinstall the editor; your settings and extensions are stored elsewhere and survive.

## When the installation is not writable

On Windows and Linux the installation folder is usually writable only by an administrator, and the extension never elevates privileges. Instead it saves the fixed `product.json` in your temporary folder and shows the command that finishes the job, with a Copy command button:

```sh
sudo cp "…/product.json" "…/product.json.ect-orig.1.132.0" && sudo cp "/tmp/editor-console-toolkit/product.json" "…/product.json"
```

Run it in a terminal with administrator rights, then quit and restart the editor. On Windows the command uses `copy /Y` and must run in an elevated terminal.

## Check which editors are supported

- Works with VS Code and editors that share its installation layout, such as Cursor, VSCodium and Windsurf; the folder comes from the running editor, not from a guess.
- Verified on real hardware on macOS only; the Windows and Linux paths are covered by tests.
- It does not patch core files for you; it only stops the editor complaining about a patch you already made. The editor vendor does not support modifying core files.
