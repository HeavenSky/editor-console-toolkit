# Change Log

**English** · [简体中文](./zh/CHANGELOG.md)

## v0.0.8 2026-10-22 Cleanup Toolkit

Adds a fourth feature area: **Cleanup Toolkit**, for clearing the editor's history, caches and work data.

### Added

- **Cleanup Toolkit: Clear History and Caches** (`editorConsoleToolkit.cleanup.clearHistory`) clears up to 27 kinds of editor and extension history and caches once you confirm the list (Command Palette history, recent files and voice transcripts ask once more), and reports how many commands ran, were skipped or failed ([what is cleared](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/cleanup.md#clear-history-and-caches)).
- **Cleanup Toolkit: Delete Work Data...** (`editorConsoleToolkit.cleanup.deleteWorkData`) deletes the checked items among chat sessions, Local History, cloud Edit Sessions and Copilot memories and index; every item starts checked ([what is deleted](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/cleanup.md#delete-work-data)).

## v0.0.7 2026-10-16 Rewritten docs

### Changed

- Docs: the README is now a short overview with a screenshot of each toolkit; full usage, settings and troubleshooting moved to [the docs pages](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/README.md), and the Chinese pages now live under `zh/`.

## v0.0.6 2026-10-15 Theme Toolkit removed

### Removed

- **Theme Toolkit** is gone: the `editorConsoleToolkit.themes.*` settings and the **Next Theme** command no longer exist, and the extension no longer switches your color theme. Any of those settings left in your `settings.json` are now unused and safe to delete. To follow the OS appearance, use VS Code's own `window.autoDetectColorScheme`.

### Changed

- The extension no longer activates on startup; it activates only when you run a command or open the Port Toolkit view.

## v0.0.5 2026-10-12 Theme Toolkit

Adds a fourth feature area: **Theme Toolkit**, for rotating color themes on a schedule.

### Added

- **Theme rotation** (`editorConsoleToolkit.themes.*`, on by default): rotates through the themes listed in `darkThemes` / `lightThemes` every `interval` minutes on the local clock (60 by default; below 30 means no rotation, above two weeks counts as two weeks), switching dark and light at `lightTime` / `darkTime` or by the OS appearance (macOS, Windows, and Linux via the XDG desktop portal, GNOME or KDE settings; rechecked every 10 minutes and on window focus). The lists accept any installed theme and default to the sixteen Editor Comfort Theme themes.
- Themes that are not installed are skipped; when none in the list to switch to is installed, rotation keeps going through the current dark/light kind's list until one is installed.
- Picking a theme outside the lists pauses rotation without changing settings; picking one from the lists resumes it from that theme. Startup only switches when the dark/light kind is wrong. Only the user-level theme is written: a window whose theme is set by workspace settings keeps it but still drives rotation; background windows and Remote windows never switch.
- **Next Theme** (`editorConsoleToolkit.themes.next`) to rotate right away.

### Changed

- Docs: the README now shows a screenshot of each feature. The images are loaded from GitHub when the page is viewed and are not packaged into the extension.

### Fixed

- The Port Toolkit view now declares its own icon, so it keeps a proper icon after being dragged into another view container or panel.
- **Insert Console Log** no longer puts the log after the whole function when the function declares a return type ending in `>`, `]` or `}` — for example `function load(): Promise<User> {`, `(): User[] {` or `(): { type: string } {`. The same applies to Rust `-> Result<T, E> {`, Swift `throws -> [Int] {` and Kotlin `: Int? {` signatures.

## v0.0.4 2026-08-12 Checksum Toolkit

Adds a third feature area: **Checksum Toolkit**, for silencing the editor's "installation appears to be corrupt" warning after you have patched its core files.

### Added

- **Fix Checksums** (`editorConsoleToolkit.checksums.apply`): rewrites only the checksums in the running editor's `product.json` that no longer match the files on disk ([how to use it](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/checksums.md#fix-the-checksums)).
- **Restore Checksums** (`editorConsoleToolkit.checksums.restore`): writes the backup back and only then deletes it, so a failure halfway through never leaves you without either file.
- A backup is **copied** to `product.json.ect-orig.<version>` before the first write, and an interrupted run cannot leave a truncated or missing `product.json` ([what changes on disk](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/checksums.md#know-what-is-changed-on-disk)).
- **No privilege elevation, ever.** Where the installation is not writable — typically Windows and Linux — the notification hands you the single command to run yourself ([details](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/checksums.md#when-the-installation-is-not-writable)).
- Backups left behind by _other_ editor versions are cleaned up when you run either command. Only files this extension wrote itself (`product.json.ect-orig.*`) are ever removed.
- Both commands refuse to run, with the reason shown, when the extension host is not the machine holding the editor: Remote (SSH, WSL, container) windows, the web, or any case where the editor cannot report its installation folder.
- 36 tests covering the checksum algorithm against fixed vectors, and the apply/restore ordering, permission-denied and partial-failure paths against an in-memory filesystem — 344 tests in total.

### Notes

- **Either command needs a full quit and restart of the editor.** Reloading the window does not apply the change; this is a property of how the editor verifies itself, not something the extension can work around.
- **Restore goes back to the state before this extension's first fix — not to a factory-fresh `product.json`.** If checksums had already been patched by another tool, that is what the backup captured. With no backup left, the way back is reinstalling the editor.
- The first fix reformats `product.json`: a JSON round-trip expands the short single-line arrays the editor ships with, which makes the file about 4KB larger. The data is equivalent, and the byte-exact original is what the backup holds.
- An editor upgrade replaces `product.json`, so the warning returns and **Fix Checksums** has to be run again. There is no automatic detection of that.
- Patching the core files themselves is out of scope — this only stops the editor complaining about a patch you already made.
- Still no runtime dependencies, no telemetry, no network access, and nothing happens at activation: the new commands touch the disk only when you run them.
- **Only verified on macOS.** The Windows and Linux paths — including the not-writable-installation flow — are implemented and covered by tests, but have not been run on a real Windows or Linux machine.
- Behaviour derived from [vscode-fix-checksums](https://github.com/RimuruChan/vscode-fix-checksums) — MIT © Jürg Lehni 2018, MIT © RimuruChan 2024. Written from scratch in TypeScript; none of its code or its `sudo-prompt` / `tmp` dependencies is bundled. The attribution lives in the README licence section.

## v0.0.3 2026-08-10 Insertion anchors

Reworks where an inserted log lands, and turns the ports view's search into a permanent row.

### Added

- **Logs now go inside the block they belong to.** With the cursor on a function signature, an `if` / `for` head or a callback body, the log becomes the block's first statement instead of landing after the whole construct ([placement rules](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/console-logs.md#know-where-the-log-lands)).
- Blocks that cannot hold statements (`switch`, `class`, Rust's `match` and `impl`) put the log on the line **before** the statement, where the value being logged has already been evaluated.
- **A search row is always present** as the first row of the Port Toolkit view, showing the term, a `2 of 7 shown` match count and a ✕ to clear it while a filter is active ([how search works](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/ports.md#search-the-list)).
- 13 regression cases covering insertion placement across the supported languages, plus a lexer test suite — 305 tests in total.

### Changed

- The ports view is now named **Port Toolkit** rather than **Listening Processes**, matching its container.
- `Search Ports` and `Clear Port Search` left the view's title bar: search is the row, and clear is the ✕ on it. Both commands remain in the Command Palette and stay bindable to a key.
- Block syntax is now read from each language's adapter rather than assumed to be C-like, which is what makes Python's indentation and the `do` / `end` blocks of Ruby, Lua and Elixir land correctly.
- Log removal now requires the log to sit on the line immediately next to its anchor, which follows from the log no longer always being _after_ the statement.

### Fixed

- The cursor being inside a **multi-line string or a block comment** is now detected: a template literal, a Python triple-quoted string or the body of a `/* … */` refuses the insertion instead of writing a log into the middle of a literal. Previously only single-line comments and strings were recognised.
- A log inserted for an argument of a **multi-line call** took its indentation from the argument's line, so it did not line up with the closing `);`. Indentation is now taken from the statement's first line.
- `if (input.type === "file") {` was read as a restricted block, because the restricted-block keywords matched **property names** as well — every condition containing `.type` had its log pushed before the statement. Property accesses no longer match.

### Notes

- **A filter does not clear your ticks.** A process ticked before you filtered stays ticked even when the filter hides its row, so `Kill Checked Processes` will terminate it. The confirmation dialog always lists everything that is about to go down.
- When the syntax is genuinely ambiguous — a lone `{` whose meaning cannot be told apart — the log falls back to landing after the whole statement: further out than you might want, but never syntactically broken.
- Still no runtime dependencies, no telemetry and no network access.

## v0.0.2 2026-08-07 Port Toolkit

Adds a second feature area: **Port Toolkit**, for seeing which processes hold your local ports and terminating them in batches.

### Added

- **Port Toolkit view** in the Activity Bar, listing every process that is listening on a local port. Rows are **one per process**, not one per port, so a process holding several ports takes a single row and the number of rows you check always equals the number of processes that get terminated.
- Source information for telling processes apart: PID, PPID, owner, uptime, working directory, every listening endpoint, and the full untruncated command line. A `this workspace` marker appears when the process was started from inside one of your open workspace folders — which is what distinguishes three concurrent `node` dev servers from each other.
- **Batch termination** via native checkboxes: check any number of rows, then run `Port Toolkit: Kill Checked Processes` ([steps](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/docs/ports.md#terminate-processes)).
- `SIGTERM` first, escalating to `SIGKILL` only after `editorConsoleToolkit.ports.killTimeout`, so a dev server gets the chance to close its sockets. Child processes are never touched (`taskkill` is invoked without `/T` on Windows).
- The command line is re-checked immediately before any signal is sent. If a process exited and its PID was reused after you checked the row, that row is skipped and reported as skipped instead of being terminated blindly.
- **The editor can never be terminated.** The parent chain from the extension host up to the editor's main process is derived from the live process tree at startup; every process on it is shown with a lock icon, has no checkbox and no terminate action. Being derived from the process tree rather than a list of names, this holds for VS Code, Cursor, Windsurf and other derivatives.
- Processes owned by another user are listed but marked as not terminable, since the extension cannot elevate.
- Search across process name, full command line, PID, working directory and any port number; system-process filtering; manual refresh.
- Five settings under `editorConsoleToolkit.ports.*`: `refreshInterval` (default `5000`, `0` disables auto-refresh), `killTimeout` (`3000`), `hideSystemProcesses` (`true`), `systemPortMax` (`1024`), `includeUdp` (`false`).
- Default keybinding `Alt+L` for **Insert Console Log**, limited to `editorTextFocus && !editorReadonly`.

### Changed

- New icon: a terminal window with two output lines — one dimmed to read as commented out, one highlighted — and three status lamps below it. The previous `>` prompt now belongs to Editor Lang Toolkit; two extensions sitting next to each other in the extensions list have to be distinguishable at a glance.

### Notes

- The view rescans **only while it is visible**; switching to another Activity Bar icon stops the timer, so there is no background scanning when you are not looking at it. One scan is three fixed command invocations regardless of how many ports are open.
- A failed scan shows a single error row in the view rather than raising a notification, because with polling a notification per cycle would bury the editor.
- Still no runtime dependencies, no telemetry and no network access.
- No default keybindings are contributed for any Port Toolkit command.
- Port and process discovery uses `lsof` on macOS, `ss` (falling back to `netstat`) on Linux, and PowerShell on Windows. **The Linux and Windows parsers are covered by fixture tests but have not been verified on real Linux or Windows machines.**

## v0.0.1 2026-08-05

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
