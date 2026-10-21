# Find and stop processes on your ports

**English** · [简体中文](../zh/docs/ports.md)

This page shows how to find the process that holds a local port, tell it apart from similar ones and terminate it safely. You need a local desktop window of VS Code 1.101 or newer on macOS, Linux or Windows.

## Open the view

Click the Port Toolkit icon in the Activity Bar. The view lists every process listening on a local port, **one row per process, not one row per port**, so the number of rows you tick is always the number of processes that get terminated. The sketch below shows the layout; the real view draws VS Code's own icons in place of these symbols.

```text
PORT TOOLKIT                                  🗑  ⧩  ⟳
  🔍 Search                for example 3000, node, ~/repo
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

The title bar holds Kill Checked Processes (trash icon), Toggle System Processes (filter icon) and Refresh Ports (refresh icon). None of the Port Toolkit commands has a default key.

## Tell processes apart

The `this workspace` marker means the process was started from inside one of your open workspace folders; when several `node` processes are listening, it tells you which one is yours. Expand or hover a row for the rest:

| Field             | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| PID, PPID         | process and parent process IDs                                   |
| User              | the process owner                                                |
| Uptime            | how long it has been running                                     |
| Working directory | where it was started, shortened to `~` under your home directory |
| Listening on      | every endpoint, with protocol and bind address                   |
| Command           | the full command line, never truncated                           |

## Search the list

Click the search row at the top and type; the list narrows after a short pause. The term matches process name, command line, PID, working directory and any port number, so `5173`, `vite` and `~/repo/web` all work.

- Enter keeps the filter; Esc restores the filter you had before opening the box.
- While a filter is active, the search row shows the term and a match count, with a clear button next to it.

```text
PORT TOOLKIT                                  🗑  ⧩  ⟳
  🔍 Search: 3000                       2 of 7 shown  ✕
  ☑ node                3000  ·  this workspace
  ☐ java                30001
```

A filter does not clear your ticks: a process ticked before you filtered stays ticked while hidden and will be terminated with the rest. The confirmation dialog always lists every process about to go down.

## Terminate processes

1. Tick the rows you want to stop. Ticks survive the automatic refresh.
2. Run Kill Checked Processes from the title bar. A modal dialog lists exactly what will be terminated.
3. Confirm. A summary reports how many processes went down and which were skipped.

To stop a single process, use the ✕ that appears when you hover its row.

Each process is first asked to shut down (`SIGTERM`; `taskkill` on Windows) and is force-killed only if it is still alive after `editorConsoleToolkit.ports.killTimeout`. Four safeguards apply:

- Child processes are left alone; only the process on the row is signalled.
- The command line is read again just before signalling. If the PID now belongs to a different command, the row is skipped and reported as skipped.
- The editor's own processes show a lock icon and have no checkbox. They are found from the live process tree, so this holds in any VS Code–compatible editor.
- Processes owned by another user are listed but cannot be terminated; the extension never elevates privileges.

## Tune refresh and filtering

The view rescans only while it is visible: switch to another Activity Bar icon and the timer stops. A failed scan shows one error row in the view instead of a notification on every cycle.

| Setting                                          | Default | Accepted values and meaning                                                               |
| ------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------- |
| `editorConsoleToolkit.ports.refreshInterval`     | `5000`  | 0–600000 ms between scans while visible; `0` refreshes only on demand                     |
| `editorConsoleToolkit.ports.killTimeout`         | `3000`  | 0–60000 ms to wait after the graceful shutdown request (`SIGTERM`) before force-killing   |
| `editorConsoleToolkit.ports.hideSystemProcesses` | `true`  | hide system processes (see below); Toggle System Processes flips it in your user settings |
| `editorConsoleToolkit.ports.systemPortMax`       | `1024`  | 0–65535; highest port treated as a system port                                            |
| `editorConsoleToolkit.ports.includeUdp`          | `false` | also list UDP endpoints, not only TCP listeners                                           |

A process counts as a system process when it was started from a system directory, or when every port it listens on is at or below `systemPortMax`. One port above the threshold keeps it visible, so a system process squatting on `8080` is never hidden silently.

## Check platform support

Ports are read with tools the OS already has: `lsof` on macOS, `ss` (falling back to `netstat`) on Linux, and PowerShell on Windows. **Only macOS has been verified on real hardware**; the Linux and Windows parsers are covered by tests only, so please [report](https://github.com/HeavenSky/editor-console-toolkit/issues) anything that looks wrong.

When the system will not say who owns a socket (on Linux this happens without root), the row is still listed with its port and the owner marked unknown, so you at least learn that the port is taken.
