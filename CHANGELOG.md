# Change Log

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
