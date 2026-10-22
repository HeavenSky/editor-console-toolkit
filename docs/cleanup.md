# Clear editor history and caches

**English** · [简体中文](../zh/docs/cleanup.md)

This page shows how to clear the editor's history and caches with one confirmation, and how to delete work data such as Local History item by item. Both commands only call commands that the editor and your extensions already provide; the extension deletes nothing by itself.

## Clear history and caches

Run Cleanup Toolkit: Clear History and Caches and confirm once: up to 27 kinds of history and caches are cleared, and a notification reports how many commands ran.

1. **Close other editor windows first.** Some history lives in each window's memory, and a window left open may write its own copy back when it closes.
2. Run Cleanup Toolkit: Clear History and Caches from the Command Palette. The confirmation lists what will be cleared; items marked "this workspace only" affect only the current workspace.
3. Choose Clear. Command Palette history, recent files and voice transcripts then show the editor's own confirmation, which you can still cancel.
4. Read the result, for example `Ran 20, skipped 0, failed 0, unfinished 0.` Choose Show Details to see each command in the Cleanup Toolkit output channel.

What is cleared:

- Editor history: Command Palette, recently opened editors, recent files and folders, search box, terminal commands and directories, chat input, recently used language models and notebook kernels, Keyboard Shortcuts editor search, References view.
- Caches: notebook editor types, test results, MCP tool lists, JSON schemas, terminal suggestion commands, old extension versions and leftover profile folders.
- **Signs you out**: storage and cookies of the built-in browser, and REST Client's Azure AD tokens.
- Other extensions, when installed: REST Client request history, Git Graph avatars, Copilot caches, W3C Color Toolkit color index, Bruno logs.

The result counts commands that ran, not data that was removed: most commands report nothing back, so a confirmation you cancelled still counts as ran. Commands from extensions that are not installed are left out of the list. Caches that live only in an extension's memory are skipped while that extension is not running, so the cleanup never starts an extension just to clear it.

Clearing the Keyboard Shortcuts editor search briefly opens that editor and closes it again. Clearing voice transcripts shows the Voice Transcripts view, because the editor only deletes them from there.

## Delete work data

Run Cleanup Toolkit: Delete Work Data..., uncheck what you want to keep, and choose OK: only the checked items are deleted, and they cannot be restored.

| Item                                      | What is deleted                                                                 | Asks again                   |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| Chat sessions in this workspace           | `chatSessions` in this workspace's storage; `~/.claude` is untouched            | Yes, when there are sessions |
| Local History of every file               | The `History` folder in your user data folder                                   | Yes                          |
| Cloud Edit Sessions                       | Every working change stored in the cloud                                        | Yes                          |
| Copilot memories                          | `memory-tool/memories` in Copilot's global storage and this workspace's storage | Yes, by Copilot              |
| Copilot codebase index for this workspace | The semantic index; rebuilding it takes a while                                 | No                           |

Every item starts checked. Copilot items appear only when GitHub Copilot Chat is installed.

## Check what a command did

Each run appends one line per command to the Cleanup Toolkit output channel: Ran, Skipped (with the reason), Failed (with the first line of the error) or Unfinished. Unfinished means a command that shows no confirmation did not return within 30 seconds; it keeps running in the background and the next command starts.

A command that a later editor version renamed or removed is reported as `command not available in this editor` and skipped.
