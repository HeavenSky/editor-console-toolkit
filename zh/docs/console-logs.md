# 插入与清理调试日志

[English](../../docs/console-logs.md) · **简体中文**

读完这页，你能插入、删除和批量开关调试日志，并修改前缀与快捷键。前提是已安装插件，并打开了[受支持语言](#支持的语言)的文件。

## 使用三条命令

三条命令都在命令面板的「控制台工具箱」分类下，只有「插入 Console 日志」自带快捷键 `Alt+L`。

1. 「插入 Console 日志」为当前目标写一条日志。对同一目标再执行一次不会重复插入。
2. 「切换 Console 日志」在日志不存在时插入，已存在时删除。光标就在日志行上时，执行它会删掉这一条。
3. 「切换全部 Console 日志」把文件里所有生成的日志注释掉，下次执行再取消注释。不会删除任何内容。

```js
// 执行前
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1

// 执行一次「切换全部 Console 日志」之后
const user = getUser();
// console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

文件里有的日志已注释、有的没有时，第一次执行会把剩下的也注释掉，让整个文件保持一致。文件里没有生成的日志时，只弹出提示，不做任何改动。

发布前在工作区搜索 `ect:v1`，删掉命中的行；「切换全部 Console 日志」只会注释，不会删除。

## 决定记录什么

有选区时记录选中的内容，没有选区时记录光标处的表达式。选区不能跨行。

光标左侧的整条属性链会一并记录：光标在 `user.profile.name` 的 `name` 上，记录的是 `user.profile.name`；光标在 `user` 上，记录的就是 `user`。

每个光标各插一条日志，一次命令的全部改动只占一步撤销。不会保存或格式化文档，除日志本身以外不改动任何一行。

## 日志插在哪里

日志插在值已经存在的地方，具体位置由光标所在的行决定：

| 光标所在 | 日志位置 |
| --- | --- |
| 开启代码块的行：函数签名、`if` / `for` 条件行、回调函数体 | 块内第一条语句，缩进与块内其他语句一致 |
| 开启不能直接放语句的块：`switch`、`class`、Rust 的 `match` 或 `impl` | 该语句的上一行，此时要记录的值已经求出 |
| 其他情况 | 所在语句之后，不论这条语句跨了几行 |

语法有歧义时（例如单独一个 `{`，既可能开启代码块，也可能是对象字面量），日志会退到整条语句之后：位置可能比你想的靠外，但不会破坏语法。位置不满意，撤销一次即可。

## 支持的语言

12 个适配器覆盖 15 种语言 ID。插件从不添加 import，所以 Java 和 C# 使用全限定名。

| 语言 | 语言 ID | 生成的语句 |
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

各语言的限制：

- Rust：值必须实现 `Debug`，否则请为类型派生 `Debug`，或手动改掉 `{:?}`。
- Kotlin 和 Dart：表达式放在字符串插值里，含 `}` 的表达式可能需要手动修正。
- JSX 和 TSX：只插在普通语句行上，不会插进 JSX 标记内部。
- Ruby、Elixir、Kotlin、Dart、C# 和 Rust：前缀里对该语言有特殊含义的字符（`#`、`$`、`{`、`}`）会自动转义。

其他语言暂不支持，包括 Go、C、C++、shell，以及 Vue、Svelte 文件里的 `<script>` 块。

## 为什么不会误删你的日志

每条生成的日志末尾都有一个用该语言注释语法写的 `ect:v1` 标记，只有带这个标记的行才会被删除或切换：

```python
print('🎯🎯🎯 [DEBUG] user:', user) # ect:v1
```

- 手写的日志即使和生成的一模一样，也不会被删。
- 标记里不含前缀，改了前缀，已插入的日志照样认得出来。
- 删除时还要求日志紧挨着它的锚点行，因此同一个变量在不同位置的日志不会混淆。
- 注释掉之后标记仍在，「切换全部 Console 日志」正是靠它找到要恢复的日志。

## 修改前缀

`editorConsoleToolkit.prefix` 是每条消息开头的文字，方便在输出里一眼找到、用 grep 筛出。每次执行都会重新读取，改完下一条日志就生效，无需重载窗口。

- 可以按工作区、文件夹和语言分别设置。
- 不要超过 80 个字符：超长时设置界面会给出警告，但不会截断。控制字符和换行会被去掉。
- 允许设为空，此时输出 `user:` 而不是 `🎯🎯🎯 [DEBUG] user:`。

```json
{
  "editorConsoleToolkit.prefix": "[debug]",
  "[python]": {
    "editorConsoleToolkit.prefix": "[py]"
  }
}
```

## 绑定或修改快捷键

`Alt+L` 只在可写编辑器获得焦点时生效（`editorTextFocus && !editorReadonly`）。两条切换命令没有默认快捷键，以免和你的配置冲突。在 `keybindings.json` 里自行添加；下面最后一项是去掉 `Alt+L`：

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

## 什么时候不会插入

插件不靠猜。以下情况只弹出警告，不改动文档：选区跨多行；光标在注释或字符串里（包括模板字符串和 Python 三引号字符串）；光标处没有表达式；语句括号不配对、字符串没闭合或超过 50 行。具体提示文字与解决办法见[故障排查](./troubleshooting.md#控制台工具箱)。
