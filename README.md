# Editor Console Toolkit

Insert and safely toggle debug console statements across 15 languages, with zero runtime dependencies. UI available in English and 简体中文 (follows the VS Code display language).

Two commands, no default keybindings, no sidebar, no status bar, no telemetry, no network access. The extension activates only when you run one of its commands.

## Commands

Both commands live in the Command Palette under the `Console Toolkit` category. Type `Console Toolkit` to find them.

| Command ID | Palette title |
| --- | --- |
| `editorConsoleToolkit.insertConsoleLog` | `Console Toolkit: Insert Console Log` |
| `editorConsoleToolkit.toggleConsoleLog` | `Console Toolkit: Toggle Console Log` |

**Insert Console Log** writes a log statement for the current target on the line after the enclosing statement. If an identical log is already there, nothing happens.

**Toggle Console Log** removes the log when it is already there and inserts it when it is not. It also works when the cursor sits on the log line itself, which is the fastest way to clean one up.

The target is the selection when you have one (single line only), otherwise the expression under the cursor. Property chains are absorbed to the left, so with the cursor on `name` in `user.profile.name` you log `user.profile.name`, and with the cursor on `user` you log `user`.

Multi-cursor is supported. Everything one invocation changes is a single undo step, the document is never saved and never formatted, and no line other than the inserted or removed log is touched.

### Keybindings

No default keybindings are contributed, so nothing collides with your existing setup. Bind them yourself in `keybindings.json`:

```json
[
  {
    "key": "ctrl+alt+l",
    "command": "editorConsoleToolkit.insertConsoleLog",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+shift+l",
    "command": "editorConsoleToolkit.toggleConsoleLog",
    "when": "editorTextFocus"
  }
]
```

## Settings

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

## Supported languages

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

### Language notes

- **Rust** — the logged value must implement `Debug`. Values that do not will fail to compile; change `{:?}` by hand or derive `Debug`.
- **Kotlin, Dart** — the expression goes inside string interpolation, so expressions containing `}` may need a manual fix.
- **JSX / TSX** — only ordinary statement lines are supported. Nothing is inserted inside JSX markup.
- **Ruby, Elixir, Kotlin, Dart, C#, Rust** — characters in your prefix that are meaningful to the target language (`#`, `$`, `{`, `}`) are escaped automatically.

## The ownership marker

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

Ship your code with the markers removed — toggle them off, or search for `ect:v1` across the workspace.

## When nothing happens

The extension refuses to guess. It shows a warning and leaves the document untouched when:

- the selection spans more than one line;
- the statement has unbalanced brackets or an unterminated string, or runs longer than 50 lines;
- the cursor is inside a comment;
- the cursor is inside a string literal;
- there is no expression under the cursor;
- the language is not supported yet.

Everything else is inserted after the enclosing statement. If a placement is not what you wanted, one undo takes it back.

## Roadmap

Language support ships in tiers because import handling, format strings and dialects differ too much for one generic implementation.

- **Tier 2** — shell / zsh, PowerShell and Perl (each needs its own safe-variable detection); Go (`fmt` import management); C and C++ (include management, format specifiers); Scala, Groovy, Clojure, R; Vue, Svelte and Astro via their `<script>` blocks; notebook cells.
- **Tier 3** — SQL, which has no single logging construct: PL/pgSQL uses `RAISE NOTICE`, T-SQL uses `PRINT`, MySQL uses a debug `SELECT`, and plain SQLite has nothing equivalent. This will require an explicit dialect setting rather than a risky fallback.

## License

MIT
