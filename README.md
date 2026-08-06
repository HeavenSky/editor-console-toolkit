# Editor Console Toolkit

Two things, zero runtime dependencies:

- **Console Toolkit** — insert and safely toggle debug console statements across 15 languages.
- **Port Toolkit** — see which processes are listening on your local ports, tell them apart by where they were started from, and terminate them in batches.

UI available in English and 简体中文 (follows the VS Code display language). No status bar, no telemetry, no network access. The console commands activate only when you run one of them; the ports view activates only when you open it.

## Console Toolkit

Three commands, in the Command Palette under the `Console Toolkit` category. Type `Console Toolkit` to find them.

| Command ID | Palette title | Default keybinding |
| --- | --- | --- |
| `editorConsoleToolkit.insertConsoleLog` | `Console Toolkit: Insert Console Log` | `Alt+L` |
| `editorConsoleToolkit.toggleConsoleLog` | `Console Toolkit: Toggle Console Log` | — |
| `editorConsoleToolkit.toggleAllConsoleLogs` | `Console Toolkit: Toggle All Console Logs` | — |

**Insert Console Log** writes a log statement for the current target on the line after the enclosing statement. If an identical log is already there, nothing happens.

**Toggle Console Log** removes the log when it is already there and inserts it when it is not. It also works when the cursor sits on the log line itself, which is the fastest way to clean one up.

**Toggle All Console Logs** comments out every log this extension generated in the current file, and uncomments them the next time you run it. Nothing is deleted, so you can silence a whole file's worth of debug output and bring it back later. When some logs are commented and others are not, the first run comments out the rest so the file ends up in one consistent state.

```js
// before
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1

// after one run
const user = getUser();
// console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

It only touches lines carrying the `ect:v1` marker, ignores your own comments and logs, keeps the indentation, and counts as a single undo step. If the file has no logs from this extension, it says so and changes nothing.

The target is the selection when you have one (single line only), otherwise the expression under the cursor. Property chains are absorbed to the left, so with the cursor on `name` in `user.profile.name` you log `user.profile.name`, and with the cursor on `user` you log `user`.

Multi-cursor is supported. Everything one invocation changes is a single undo step, the document is never saved and never formatted, and no line other than the inserted or removed log is touched.

### Keybindings

Only **Insert Console Log** ships with a default keybinding, `Alt+L` (`Option+L` on macOS), guarded by `editorTextFocus && !editorReadonly` so it never fires outside a writable editor. The other two commands are deliberately left unbound so nothing else collides with your existing setup.

Bind them yourself in `keybindings.json`, and rebind or unbind `Alt+L` the same way:

```json
[
  {
    "key": "ctrl+alt+shift+l",
    "command": "editorConsoleToolkit.toggleConsoleLog",
    "when": "editorTextFocus && !editorReadonly"
  },
  {
    "key": "ctrl+alt+shift+k",
    "command": "editorConsoleToolkit.toggleAllConsoleLogs",
    "when": "editorTextFocus && !editorReadonly"
  },
  {
    "key": "alt+l",
    "command": "-editorConsoleToolkit.insertConsoleLog"
  }
]
```

### Settings

| Setting | Type | Default | Scope |
| --- | --- | --- | --- |
| `editorConsoleToolkit.prefix` | `string` | `🎯🎯🎯 [DEBUG]` | `language-overridable` |

The prefix is included in the generated message so your debug output is easy to spot and easy to grep. It is read fresh on every invocation, so changes take effect immediately without reloading the window.

Because the scope is `language-overridable`, you can override it per workspace, per folder and per language:

```json
{
  "editorConsoleToolkit.prefix": "[debug]",
  "[python]": {
    "editorConsoleToolkit.prefix": "[py]"
  }
}
```

An empty prefix is valid and produces `user:` instead of `🎯🎯🎯 [DEBUG] user:`. Control characters and line breaks are stripped silently.

### Supported languages

`TEXT` below stands for `<prefix> <label>:`, for example `🎯🎯🎯 [DEBUG] user:`.

| Language | Language IDs | Generated statement |
| --- | --- | --- |
| JavaScript / JSX / TypeScript / TSX | `javascript`, `javascriptreact`, `typescript`, `typescriptreact` | `console.log('🎯🎯🎯 [DEBUG] user:', user);` |
| Python | `python` | `print('🎯🎯🎯 [DEBUG] user:', user)` |
| Java | `java` | `System.out.println("🎯🎯🎯 [DEBUG] user: " + String.valueOf(user));` |
| Kotlin | `kotlin` | `println("🎯🎯🎯 [DEBUG] user: ${user}")` |
| C# | `csharp` | `System.Console.WriteLine("🎯🎯🎯 [DEBUG] user: {0}", user);` |
| Lua | `lua` | `print("🎯🎯🎯 [DEBUG] user:", user)` |
| Ruby | `ruby` | `puts "🎯🎯🎯 [DEBUG] user: #{(user).inspect}"` |
| PHP | `php` | `var_dump('🎯🎯🎯 [DEBUG] user:', $user);` |
| Swift | `swift` | `print("🎯🎯🎯 [DEBUG] user:", user)` |
| Dart | `dart` | `print('🎯🎯🎯 [DEBUG] user: ${user}');` |
| Rust | `rust` | `println!("🎯🎯🎯 [DEBUG] user: {:?}", user);` |
| Elixir | `elixir` | `IO.inspect(user, label: "🎯🎯🎯 [DEBUG] user")` |

No imports are ever added. Java and C# use fully qualified names for that reason.

#### Language notes

- **Rust** — the logged value must implement `Debug`. Values that do not will fail to compile; change `{:?}` by hand or derive `Debug`.
- **Kotlin, Dart** — the expression goes inside string interpolation, so expressions containing `}` may need a manual fix.
- **JSX / TSX** — only ordinary statement lines are supported. Nothing is inserted inside JSX markup.
- **Ruby, Elixir, Kotlin, Dart, C#, Rust** — characters in your prefix that are meaningful to the target language (`#`, `$`, `{`, `}`) are escaped automatically.

### The ownership marker

Every generated log carries a short trailing marker:

```js
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

```python
print('🎯🎯🎯 [DEBUG] user:', user) # ect:v1
```

This marker is the only thing that makes a line eligible for removal.

- Logs you wrote by hand are never removed, even if they look identical.
- The marker does not contain the prefix, so changing `editorConsoleToolkit.prefix` does not orphan the logs you already inserted.
- Removal also requires the log to sit on the line right after its target statement, which is what keeps two logs for the same variable name in different places from being confused.

Ship your code with the markers removed — toggle them off, or search for `ect:v1` across the workspace. The marker survives commenting, so **Toggle All Console Logs** can still find and restore a log you commented out earlier.

### When nothing happens

The extension refuses to guess. It shows a warning and leaves the document untouched when:

- the selection spans more than one line;
- the statement has unbalanced brackets or an unterminated string, or runs longer than 50 lines;
- the cursor is inside a comment;
- the cursor is inside a string literal;
- there is no expression under the cursor;
- the language is not supported yet.

Everything else is inserted after the enclosing statement. If a placement is not what you wanted, one undo takes it back.

## Port Toolkit

A **Port Toolkit** icon appears in the Activity Bar. The view lists every process listening on a local port, **one row per process** — not one row per port. A process that listens on several ports takes a single row, so the number of rows you check is always the number of processes that get terminated.

Each row shows the process name, its ports, and a `this workspace` marker when the process was started from inside one of your open workspace folders. That marker is the point of the whole view: when three `node` processes are listening, the working directory is what tells you which one is yours.

Expand a row for the details, or hover for the same information as a tooltip:

| Field | Where it comes from |
| --- | --- |
| PID, PPID | the port scan itself |
| User | the process owner |
| Uptime | elapsed time, not a locale-dependent start timestamp |
| Working directory | resolved per process; abbreviated to `~` under your home directory |
| Listening on | every endpoint, with protocol and bind address |
| Command | the full command line, never truncated |

### Commands

All commands live in the Command Palette under the `Port Toolkit` category, and the view's title bar carries the same actions. No default keybindings are contributed for any of them.

| Command ID | Palette title | Where |
| --- | --- | --- |
| `editorConsoleToolkit.ports.killSelected` | `Port Toolkit: Kill Checked Processes` | title bar, palette |
| `editorConsoleToolkit.ports.search` | `Port Toolkit: Search Ports` | title bar, palette |
| `editorConsoleToolkit.ports.clearSearch` | `Port Toolkit: Clear Port Search` | title bar, palette |
| `editorConsoleToolkit.ports.toggleSystemProcesses` | `Port Toolkit: Toggle System Processes` | title bar, palette |
| `editorConsoleToolkit.ports.refresh` | `Port Toolkit: Refresh Ports` | title bar, palette |
| `editorConsoleToolkit.ports.killOne` | `Port Toolkit: Kill Process` | row hover, right-click |

**Batch termination.** Check as many rows as you like, then run **Kill Checked Processes**. You get a modal confirmation listing exactly what will be terminated, and afterwards a summary of how many actually went down. Checked rows survive the automatic refresh, so you can take your time.

**Search** filters on process name, full command line, PID, working directory and any port number, so `5173`, `vite` and `~/repo/web` all work.

### How processes are terminated

`SIGTERM` first, then `SIGKILL` only if the process is still alive after `killTimeout`. A dev server that handles `SIGTERM` gets the chance to close its sockets and clean up temporary files.

- **Only the process itself.** Child processes are never touched — on Windows `taskkill` is invoked without `/T`.
- **The command line is re-checked immediately before any signal is sent.** Between checking a row and confirming, a process can exit and its PID be reused by something else; if the command line no longer matches, that row is skipped and reported as skipped rather than being terminated blindly.
- **The editor can never be terminated.** At startup the extension walks the parent chain from its own extension host up to the editor's main process; every process on that chain is shown with a lock icon, has no checkbox, and has no terminate action. This is derived from the actual process tree rather than a list of process names, so it holds for VS Code, Cursor, Windsurf and any other derivative.
- **Processes owned by another user are listed but not terminable**, since the extension cannot elevate. They are marked accordingly.

### Refresh behaviour

The view rescans every `refreshInterval` milliseconds **only while it is visible**. Switch to another Activity Bar icon and the timer stops; there is no background scanning when you are not looking at it. Set `refreshInterval` to `0` to refresh only when you ask.

A scan is three fixed command invocations regardless of how many ports are open. If a scan fails, the view shows a single error row instead of raising a notification — with polling, a notification per cycle would bury the editor.

### Settings

| Setting | Type | Default |
| --- | --- | --- |
| `editorConsoleToolkit.ports.refreshInterval` | `number` | `5000` (`0` disables auto-refresh) |
| `editorConsoleToolkit.ports.killTimeout` | `number` | `3000` |
| `editorConsoleToolkit.ports.hideSystemProcesses` | `boolean` | `true` |
| `editorConsoleToolkit.ports.systemPortMax` | `number` | `1024` |
| `editorConsoleToolkit.ports.includeUdp` | `boolean` | `false` |

A process counts as a system process when its executable lives in a system directory (`/System`, `/usr/libexec`, `/usr/sbin`, `/sbin`, `/usr/lib`, `C:\Windows`) **or** when every port it listens on is at or below `systemPortMax`. One port above the threshold is enough to keep it visible, so a system-path process squatting on `8080` is never silently hidden.

### Platform support

| Platform | How ports are read | Verified |
| --- | --- | --- |
| macOS | `lsof` + `ps` | on real hardware |
| Linux | `ss` (falls back to `netstat`) + `ps` + `/proc/<pid>/cwd` | **parsers covered by fixture tests only, not verified on a real Linux machine** |
| Windows | PowerShell `Get-NetTCPConnection` / `Get-NetUDPEndpoint` + `Get-CimInstance Win32_Process` | **parsers covered by fixture tests only, not verified on a real Windows machine** |

On Linux without root, `ss` cannot attribute a socket to a process. Such a row is still listed — with the port visible and the owner marked unknown — instead of being dropped, so at least you know the port is taken.

## Roadmap

Language support for **Console Toolkit** ships in tiers because import handling, format strings and dialects differ too much for one generic implementation.

- **Tier 2** — shell / zsh, PowerShell and Perl (each needs its own safe-variable detection); Go (`fmt` import management); C and C++ (include management, format specifiers); Scala, Groovy, Clojure, R; Vue, Svelte and Astro via their `<script>` blocks; notebook cells.
- **Tier 3** — SQL, which has no single logging construct: PL/pgSQL uses `RAISE NOTICE`, T-SQL uses `PRINT`, MySQL uses a debug `SELECT`, and plain SQLite has nothing equivalent. This will require an explicit dialect setting rather than a risky fallback.

## License

MIT
