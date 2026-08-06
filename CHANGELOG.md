# Change Log

## 0.0.2

Adds a second feature area: **Port Toolkit**, for seeing which processes hold your local ports and terminating them in batches.

### Added

- **Port Toolkit view** in the Activity Bar, listing every process that is listening on a local port. Rows are **one per process**, not one per port, so a process holding several ports takes a single row and the number of rows you check always equals the number of processes that get terminated.
- Source information for telling processes apart: PID, PPID, owner, uptime, working directory, every listening endpoint, and the full untruncated command line. A `this workspace` marker appears when the process was started from inside one of your open workspace folders — which is what distinguishes three concurrent `node` dev servers from each other.
- **Batch termination** via native checkboxes: check any number of rows, then run `Port Toolkit: Kill Checked Processes`. A modal confirmation lists exactly what will be terminated, and a summary afterwards reports how many actually went down. Checked rows survive the automatic refresh.
- `SIGTERM` first, escalating to `SIGKILL` only after `editorConsoleToolkit.ports.killTimeout`, so a dev server gets the chance to close its sockets. Child processes are never touched (`taskkill` is invoked without `/T` on Windows).
- The command line is re-checked immediately before any signal is sent. If a process exited and its PID was reused after you checked the row, that row is skipped and reported as skipped instead of being terminated blindly.
- **The editor can never be terminated.** The parent chain from the extension host up to the editor's main process is derived from the live process tree at startup; every process on it is shown with a lock icon, has no checkbox and no terminate action. Being derived from the process tree rather than a list of names, this holds for VS Code, Cursor, Windsurf and other derivatives.
- Processes owned by another user are listed but marked as not terminable, since the extension cannot elevate.
- Search across process name, full command line, PID, working directory and any port number; system-process filtering; manual refresh.
- Five settings under `editorConsoleToolkit.ports.*`: `refreshInterval` (default `5000`, `0` disables auto-refresh), `killTimeout` (`3000`), `hideSystemProcesses` (`true`), `systemPortMax` (`1024`), `includeUdp` (`false`).
- Default keybinding `Alt+L` for **Insert Console Log**, limited to `editorTextFocus && !editorReadonly`.

### Notes

- The view rescans **only while it is visible**; switching to another Activity Bar icon stops the timer, so there is no background scanning when you are not looking at it. One scan is three fixed command invocations regardless of how many ports are open.
- A failed scan shows a single error row in the view rather than raising a notification, because with polling a notification per cycle would bury the editor.
- Still no runtime dependencies, no telemetry and no network access.
- No default keybindings are contributed for any Port Toolkit command.
- Port and process discovery uses `lsof` on macOS, `ss` (falling back to `netstat`) on Linux, and PowerShell on Windows. **The Linux and Windows parsers are covered by fixture tests but have not been verified on real Linux or Windows machines.**

## 0.0.1

Initial release.

### Added

- **Insert Console Log** (`editorConsoleToolkit.insertConsoleLog`): inserts a debug log statement for the selected expression, or for the expression under the cursor, on the line after the enclosing statement.
- **Toggle Console Log** (`editorConsoleToolkit.toggleConsoleLog`): inserts the log when it is missing and removes it when it is already there. Also removes the log when the cursor sits on the log line itself.
- **Toggle All Console Logs** (`editorConsoleToolkit.toggleAllConsoleLogs`): comments out every generated log in the current file, and uncomments them on the next run. Nothing is deleted, indentation is preserved, and a mixed file converges to fully commented on the first run.
- Support for 12 language adapters covering 15 language ids: JavaScript, JSX, TypeScript, TSX, Python, Java, Kotlin, C#, Lua, Ruby, PHP, Swift, Dart, Rust and Elixir.
- `editorConsoleToolkit.prefix` setting (default `🎯🎯🎯 [DEBUG]`), scoped as `language-overridable` so it can be overridden per workspace, per folder and per language.
- Multi-cursor support. Every change made by one command invocation is a single undo step, and the document is never saved or formatted automatically.
- Generated logs carry a short ownership marker (`// ect:v1`) so the extension only ever removes its own logs, and keeps removing them after the prefix is changed.
- UI available in English and 简体中文, following the VS Code display language.

### Notes

- No default keybindings are contributed. Bind the three commands yourself in Keyboard Shortcuts.
- The extension has no runtime dependencies, no telemetry, no network access and no background listeners. It activates only when one of its two commands runs.
