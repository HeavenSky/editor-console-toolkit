# Editor Console Toolkit

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/HeavenSky.editor-console-toolkit?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/HeavenSky.editor-console-toolkit)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE.txt)

Two everyday chores, one extension, zero runtime dependencies.

| | What it does | Where you use it |
| --- | --- | --- |
| **Console Toolkit** | Insert a debug log for whatever is under your cursor, then toggle it — or every log in the file — back off. 15 languages. | Command Palette, `Alt+L` |
| **Port Toolkit** | See which processes hold your local ports, tell them apart by where they were started, and terminate several at once. | Activity Bar |

UI in English and 简体中文, following your VS Code display language.

---

## Install

- **VS Code** — search `Editor Console Toolkit` in the Extensions view, or run `ext install HeavenSky.editor-console-toolkit` in the Command Palette.
- **Cursor, Windsurf, VSCodium and other derivatives** — download the `.vsix` from the [latest GitHub release](https://github.com/HeavenSky/editor-console-toolkit/releases) and run **Extensions: Install from VSIX…**.

### Requirements

| | Requirement |
| --- | --- |
| Editor | VS Code `1.101.0` or newer |
| Console Toolkit | nothing else |
| Port Toolkit on macOS | `lsof` and `ps` (both ship with macOS) |
| Port Toolkit on Linux | `ss` or `netstat`, plus `ps` |
| Port Toolkit on Windows | `powershell.exe` |

No runtime dependencies are bundled, and nothing is downloaded at runtime.

---

## Quick start

**Log a variable.** Put the cursor on it and press `Alt+L` (`Option+L` on macOS):

```js
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

**Clean up before committing.** Run **Console Toolkit: Toggle All Console Logs** to comment out every log the extension generated in the file — run it again to bring them back. Nothing is ever deleted.

**Free up a port.** Click the **Port Toolkit** icon in the Activity Bar, find the row with the `this workspace` marker, tick it and hit the 🗑 button in the view's title bar.

---

## Console Toolkit

### Commands

Type `Console Toolkit` in the Command Palette to find all three.

| Command | ID | Keybinding |
| --- | --- | --- |
| Insert Console Log | `editorConsoleToolkit.insertConsoleLog` | `Alt+L` |
| Toggle Console Log | `editorConsoleToolkit.toggleConsoleLog` | — |
| Toggle All Console Logs | `editorConsoleToolkit.toggleAllConsoleLogs` | — |

**Insert Console Log** writes a log for the current target on the line after the enclosing statement. Running it twice does nothing the second time.

**Toggle Console Log** inserts the log if it is missing and removes it if it is already there. It also works with the cursor on the log line itself, which is the quickest way to delete one.

**Toggle All Console Logs** comments out every generated log in the file, and uncomments them next time:

```js
// before
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1

// after one run
const user = getUser();
// console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

If some logs are commented and others are not, the first run comments out the rest so the file ends up consistent. If the file has no generated logs, it says so and changes nothing.

### What gets logged

The target is your selection when you have one (single line only), otherwise the expression under the cursor.

Property chains are absorbed to the left: with the cursor on `name` in `user.profile.name` you log `user.profile.name`; with the cursor on `user` you log `user`.

Multi-cursor works. Everything one invocation changes is a **single undo step**, the document is never saved and never formatted, and no line other than the log itself is touched.

### Keybindings

Only **Insert Console Log** ships with a default binding, guarded by `editorTextFocus && !editorReadonly` so it never fires outside a writable editor. The other two are deliberately left unbound so nothing collides with your setup.

Bind them yourself in `keybindings.json` — and rebind or remove `Alt+L` the same way:

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

### Setting

| Setting | Type | Default | Scope |
| --- | --- | --- | --- |
| `editorConsoleToolkit.prefix` | `string` | `🎯🎯🎯 [DEBUG]` | `language-overridable` |

The prefix goes into the generated message so your output is easy to spot and easy to grep. It is read fresh on every invocation — changes take effect immediately, no window reload.

Because the scope is `language-overridable`, you can override it per workspace, per folder and per language:

```json
{
  "editorConsoleToolkit.prefix": "[debug]",
  "[python]": {
    "editorConsoleToolkit.prefix": "[py]"
  }
}
```

An empty prefix is valid and gives you `user:` instead of `🎯🎯🎯 [DEBUG] user:`. Control characters and line breaks are stripped silently.

### Supported languages

12 adapters covering 15 language IDs. No imports are ever added — Java and C# use fully qualified names for that reason.

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

Per-language caveats:

- **Rust** — the value must implement `Debug`. If it does not, the code will not compile; change `{:?}` by hand or derive `Debug`.
- **Kotlin, Dart** — the expression sits inside string interpolation, so expressions containing `}` may need a manual fix.
- **JSX / TSX** — ordinary statement lines only. Nothing is inserted inside JSX markup.
- **Ruby, Elixir, Kotlin, Dart, C#, Rust** — characters in your prefix that mean something to the target language (`#`, `$`, `{`, `}`) are escaped for you.

### Why your own logs are safe

Every generated log carries a short trailing marker, using the target language's comment syntax:

```js
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

```python
print('🎯🎯🎯 [DEBUG] user:', user) # ect:v1
```

That marker is the **only** thing that makes a line eligible for removal:

- Logs you wrote by hand are never removed, even if they look identical.
- The marker does not contain the prefix, so changing `editorConsoleToolkit.prefix` does not orphan logs you already inserted.
- Removal also requires the log to sit directly after its target statement, so two logs for the same variable name in different places never get confused.

Ship your code with the markers gone — toggle them off, or search the workspace for `ect:v1`. The marker survives commenting, which is how **Toggle All Console Logs** finds and restores a log you commented out earlier.

### When nothing happens

The extension refuses to guess. It shows a warning and leaves the document untouched when:

- the selection spans more than one line;
- the statement has unbalanced brackets or an unterminated string, or runs longer than 50 lines;
- the cursor is inside a comment;
- the cursor is inside a string literal;
- there is no expression under the cursor;
- the language is not supported yet.

Everything else gets inserted after the enclosing statement. If a placement is not what you wanted, one undo takes it back.

---

## Port Toolkit

Click the **Port Toolkit** icon in the Activity Bar. The view lists every process listening on a local port — **one row per process, not one row per port**:

```text
LISTENING PROCESSES                       🗑  🔍  ⌫  ⧩  ⟳
  ☑ node                5173, 24678  ·  this workspace
      PID: 41802  ·  PPID: 41799  ·  sky
      Uptime: 12:33
      Working directory: ~/repo/web/apps/site
      Listening on: TCP 0.0.0.0:5173  ·  TCP 127.0.0.1:24678
      Command: node vite --host --port 5173
  ☑ node                3000  ·  this workspace
  ☐ java                8080
  🔒 Code Helper         6001  ·  the editor itself
```

A process holding several ports takes a single row, so **the number of rows you tick is always the number of processes that get terminated** — no double-counting, no surprises.

### Telling processes apart

The `this workspace` marker appears when the process was started from inside one of your open workspace folders. That marker is the whole point of the view: when three `node` processes are listening, the working directory is what tells you which one is yours.

Expand a row — or hover it — for the rest:

| Field | Meaning |
| --- | --- |
| PID, PPID | process and parent process IDs |
| User | the process owner |
| Uptime | how long it has been running (elapsed time, not a locale-dependent timestamp) |
| Working directory | resolved per process, abbreviated to `~` under your home directory |
| Listening on | every endpoint, with protocol and bind address |
| Command | the full command line, never truncated |

### Commands

Type `Port Toolkit` in the Command Palette. The view's title bar carries the same actions. **No default keybindings** are contributed for any of them.

| Command | ID | Where |
| --- | --- | --- |
| Kill Checked Processes | `editorConsoleToolkit.ports.killSelected` | 🗑 title bar, palette |
| Search Ports | `editorConsoleToolkit.ports.search` | 🔍 title bar, palette |
| Clear Port Search | `editorConsoleToolkit.ports.clearSearch` | ⌫ title bar, palette |
| Toggle System Processes | `editorConsoleToolkit.ports.toggleSystemProcesses` | ⧩ title bar, palette |
| Refresh Ports | `editorConsoleToolkit.ports.refresh` | ⟳ title bar, palette |
| Kill Process | `editorConsoleToolkit.ports.killOne` | row hover, right-click |

**Terminating in batches.** Tick as many rows as you like, then run **Kill Checked Processes**. You get a modal confirmation listing exactly what will be terminated, and afterwards a summary of how many actually went down. Ticked rows survive the automatic refresh, so you can take your time.

**Searching** matches process name, full command line, PID, working directory and any port number — `5173`, `vite` and `~/repo/web` all work.

### How termination works

`SIGTERM` first, escalating to `SIGKILL` only if the process is still alive after `killTimeout`. A dev server that handles `SIGTERM` gets its chance to close sockets and clean up temporary files.

Four things it will not do:

- **It will not touch child processes.** On Windows `taskkill` is invoked without `/T`.
- **It will not terminate a process whose command line changed.** The command line is re-read immediately before any signal is sent. Between ticking a row and confirming, a process can exit and its PID be reused by something else — if the command line no longer matches, that row is skipped and reported as skipped rather than killed blindly.
- **It can never terminate your editor.** At startup the extension walks the parent chain from its own extension host up to the editor's main process. Every process on that chain gets a lock icon, no checkbox and no terminate action. This comes from the live process tree rather than a list of process names, so it holds for VS Code, Cursor, Windsurf and any other derivative.
- **It will not try to elevate.** Processes owned by another user are listed and labelled, but cannot be terminated.

### Refresh behaviour

The view rescans every `refreshInterval` milliseconds **only while it is visible**. Switch to another Activity Bar icon and the timer stops — there is no background scanning when you are not looking at it. Set `refreshInterval` to `0` to refresh only on demand.

One scan is three fixed command invocations regardless of how many ports are open. If a scan fails, the view shows a single error row rather than raising a notification — with polling, one notification per cycle would bury the editor.

### Settings

| Setting | Type | Default | What it does |
| --- | --- | --- | --- |
| `editorConsoleToolkit.ports.refreshInterval` | `number` | `5000` | Rescan interval in ms while the view is visible. `0` disables auto-refresh. |
| `editorConsoleToolkit.ports.killTimeout` | `number` | `3000` | How long to wait after `SIGTERM` before escalating to `SIGKILL`. |
| `editorConsoleToolkit.ports.hideSystemProcesses` | `boolean` | `true` | Hide system processes. |
| `editorConsoleToolkit.ports.systemPortMax` | `number` | `1024` | Highest port number treated as a system port. |
| `editorConsoleToolkit.ports.includeUdp` | `boolean` | `false` | Also list UDP endpoints, not just TCP listeners. |

A process counts as a system process when its executable lives in a system directory (`/System`, `/usr/libexec`, `/usr/sbin`, `/sbin`, `/usr/lib`, `C:\Windows`) **or** when every port it listens on is at or below `systemPortMax`. One port above the threshold is enough to keep it visible, so a system-path process squatting on `8080` is never silently hidden.

### Platform support

| Platform | How ports are read | Status |
| --- | --- | --- |
| macOS | `lsof` + `ps` | verified on real hardware |
| Linux | `ss` (falls back to `netstat`) + `ps` + `/proc/<pid>/cwd` | ⚠️ parsers covered by fixture tests, **not yet verified on a real Linux machine** |
| Windows | PowerShell `Get-NetTCPConnection` / `Get-NetUDPEndpoint` + `Get-CimInstance Win32_Process` | ⚠️ parsers covered by fixture tests, **not yet verified on a real Windows machine** |

On Linux without root, `ss` cannot attribute a socket to a process. That row is still listed — port visible, owner marked unknown — instead of being dropped, so you at least know the port is taken.

---

## Privacy and performance

- **No telemetry, no network access.** Nothing about you or your code leaves your machine.
- **No runtime dependencies.** The extension ships as a single bundled file.
- **Console Toolkit is purely command-driven** — no listeners, no timers, no status bar item. It does nothing until you run one of its commands.
- **Port Toolkit only works while you are watching it.** The scan timer exists only while its view is visible, and each scan is three short command invocations.

These are enforced by a static gate in the repository, not just by convention: the console modules are checked to contain no timer, listener or persistent-UI API at all.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Alt+L` does nothing | The binding requires `editorTextFocus && !editorReadonly`. Check for a conflict in **Keyboard Shortcuts** (search `alt+l`). |
| "Console Toolkit does not support this language yet" | The language has no adapter yet. See [Supported languages](#supported-languages) and the [Roadmap](#roadmap). |
| A log will not toggle off | It has no `ect:v1` marker, or it is no longer on the line directly after its target statement. Remove it by hand. |
| The ports view is empty | Everything listening may be filtered as a system process. Run **Toggle System Processes**, or lower `systemPortMax`. |
| A row says the process cannot be terminated | It is your editor, its ancestor, or owned by another user. See [How termination works](#how-termination-works). |
| "Port scan failed" row | The platform tool is missing or refused to run — see [Requirements](#requirements). The row shows the underlying reason. |
| The port list looks stale | The view only refreshes while visible. Hit ⟳, or check that `refreshInterval` is not `0`. |

## Roadmap

Console Toolkit language support ships in tiers, because import handling, format strings and dialects differ too much for one generic implementation.

- **Tier 2** — shell / zsh, PowerShell and Perl (each needs its own safe-variable detection); Go (`fmt` import management); C and C++ (include management, format specifiers); Scala, Groovy, Clojure, R; Vue, Svelte and Astro via their `<script>` blocks; notebook cells.
- **Tier 3** — SQL, which has no single logging construct: PL/pgSQL uses `RAISE NOTICE`, T-SQL uses `PRINT`, MySQL uses a debug `SELECT`, and plain SQLite has nothing equivalent. This needs an explicit dialect setting rather than a risky fallback.

For Port Toolkit, the next step is verifying the Linux and Windows scanners on real machines.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE.txt)
