# Insert and clean up debug logs

**English** · [简体中文](../zh/docs/console-logs.md)

This page shows how to insert, remove and bulk-toggle debug logs, and how to change the prefix and keybindings. You need the extension installed and a file open in a [supported language](#supported-languages).

## Use the three commands

All three are in the Command Palette under `Console Toolkit`; only Insert Console Log has a default key (`Alt+L`).

1. Insert Console Log writes a log for the current target. Running it again on the same target does nothing.
2. Toggle Console Log inserts the log if it is missing and removes it if it is there. With the cursor on the log line itself, it deletes that log.
3. Toggle All Console Logs comments out every generated log in the file, and uncomments them on the next run. Nothing is deleted.

```js
// before
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1

// after one run of Toggle All Console Logs
const user = getUser();
// console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

When some logs are commented and others are not, the first run comments out the rest so the file ends up consistent. A file with no generated logs is left unchanged with a warning.

Before you ship, search the workspace for `ect:v1` and delete the matching lines; Toggle All Console Logs only comments them out.

## Choose what gets logged

The target is your selection when you have one, otherwise the expression under the cursor. A selection must stay on one line.

The whole property chain to the left of the cursor is included: with the cursor on `name` in `user.profile.name` you log `user.profile.name`; with the cursor on `user` you log `user`.

Every cursor gets its own log, and everything one command changes is a single undo step. The document is never saved or formatted, and no line other than the log itself is touched.

## Know where the log lands

The log goes where the value already exists, chosen by the line the cursor is on:

| Cursor is on | The log goes |
| --- | --- |
| a line that opens a block: a function signature, an `if` / `for` condition line, a callback body | inside the block, as its first statement, indented like the rest of the block |
| a line that opens a block that cannot hold statements: `switch`, `class`, Rust's `match` or `impl` | on the line before that statement, where the value has already been evaluated |
| anything else | after the enclosing statement, however many lines it spans |

When the syntax is ambiguous, for example a lone `{` that could open either a block or an object literal, the log lands after the whole statement: further out than you might want, but never syntactically broken. One undo takes back any placement you do not like.

## Supported languages

Twelve adapters cover 15 language IDs. No imports are ever added, which is why Java and C# use fully qualified names.

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

Language-specific limits:

- Rust: the value must implement `Debug`; otherwise derive it or change `{:?}` by hand.
- Kotlin and Dart: the expression sits inside string interpolation, so an expression containing `}` may need a manual fix.
- JSX and TSX: logs go on ordinary statement lines only, never inside JSX markup.
- Ruby, Elixir, Kotlin, Dart, C# and Rust: characters in your prefix that mean something to the language (`#`, `$`, `{`, `}`) are escaped for you.

Other languages, including Go, C, C++, shell and the `<script>` blocks of Vue or Svelte files, are not supported.

## Why your own logs are safe

Every generated log ends with an `ect:v1` marker written in the language's comment syntax, and only lines with that marker can be removed or toggled:

```python
print('🎯🎯🎯 [DEBUG] user:', user) # ect:v1
```

- Logs you wrote by hand are never removed, even when they look identical.
- The marker does not contain the prefix, so changing the prefix does not orphan logs you already inserted.
- Removal also requires the log to sit right next to its anchor line, so logs for the same variable in different places never get confused.
- The marker survives commenting, which is how Toggle All Console Logs finds a log to restore.

## Change the prefix

`editorConsoleToolkit.prefix` is the text at the start of every message, so your output is easy to spot and grep. It is read on every run, so a change applies to the next log without a reload.

- It can be set per workspace, per folder and per language.
- Keep it within 80 characters: the Settings editor warns about longer values, but they are not truncated. Control characters and line breaks are removed.
- An empty prefix is allowed and gives you `user:` instead of `🎯🎯🎯 [DEBUG] user:`.

```json
{
  "editorConsoleToolkit.prefix": "[debug]",
  "[python]": {
    "editorConsoleToolkit.prefix": "[py]"
  }
}
```

## Bind or rebind the keys

`Alt+L` only fires when a writable editor has focus (`editorTextFocus && !editorReadonly`). The two toggle commands have no default key so they cannot collide with your setup. Add your own in `keybindings.json`; the last entry below removes `Alt+L`:

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

## When nothing is inserted

The extension does not guess. It shows a warning and leaves the document untouched when the selection spans several lines, the cursor is inside a comment or string (including template literals and Python triple-quoted strings), there is no expression under the cursor, or the statement has unbalanced brackets, an unterminated string or more than 50 lines. The exact messages and fixes are in [Troubleshooting](./troubleshooting.md#console-toolkit).
