# Editor Console Toolkit

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/HeavenSky.editor-console-toolkit?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/HeavenSky.editor-console-toolkit)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE.txt)

两件日常琐事, 一个插件, 零运行时依赖.

| | 做什么 | 在哪用 |
| --- | --- | --- |
| **Console Toolkit** | 为光标处的表达式插入调试日志, 再一键把它 (或整个文件的日志) 关掉. 支持 15 种语言. | 命令面板, `Alt+L` |
| **Port Toolkit** | 查看哪些进程占着本机端口, 按启动位置区分它们, 并一次终止多个. | 活动栏 |

界面提供英文与简体中文, 跟随 VS Code 的显示语言.

**[English](README.md)**

---

## 安装

- **VS Code** — 在扩展视图搜索 `Editor Console Toolkit`, 或在命令面板执行 `ext install HeavenSky.editor-console-toolkit`.
- **其他兼容 VS Code 的编辑器** — 从 [最新的 GitHub release](https://github.com/HeavenSky/editor-console-toolkit/releases) 下载 `.vsix`, 然后执行 **Extensions: Install from VSIX…**.

### 环境要求

VS Code `1.101.0` 或更高版本. 其他什么都不用装: 没有捆绑依赖, 运行时不下载任何东西, Port Toolkit 读取端口用的是 macOS, Linux 与 Windows 自带的能力.

---

## 快速开始

**记录一个变量.** 把光标放上去, 按 `Alt+L` (macOS 上是 `Option+L`):

```js
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

**提交前清理.** 执行 **Console Toolkit: Toggle All Console Logs**, 把本插件在当前文件生成的日志全部注释掉 — 再执行一次就恢复. 任何时候都不会真的删除.

**释放一个端口.** 点开活动栏的 **Port Toolkit** 图标, 找到带 `本工作区` 标记的那一行, 勾上它, 然后点视图标题栏的 🗑 按钮.

---

## Console Toolkit

### 命令

在命令面板输入 `Console Toolkit` 即可找到全部三条.

| 命令 | ID | 快捷键 |
| --- | --- | --- |
| Insert Console Log | `editorConsoleToolkit.insertConsoleLog` | `Alt+L` |
| Toggle Console Log | `editorConsoleToolkit.toggleConsoleLog` | — |
| Toggle All Console Logs | `editorConsoleToolkit.toggleAllConsoleLogs` | — |

**Insert Console Log** 在所属语句的下一行写入日志. 重复执行第二次不会再插入.

**Toggle Console Log** 没有日志时插入, 已有时移除. 光标停在日志行本身时同样有效, 这是删掉一条日志最快的方式.

**Toggle All Console Logs** 把当前文件里生成的日志全部注释掉, 下次执行再取消注释:

```js
// 执行前
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1

// 执行一次后
const user = getUser();
// console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

如果文件里一部分已注释一部分没有, 第一次执行会把剩下的也注释掉, 使整个文件状态一致. 文件里没有本插件生成的日志时, 它会提示并且什么都不改.

### 记录的目标是什么

有选区时取选区 (仅支持单行), 否则取光标所在的表达式.

属性链向左吸收: 光标在 `user.profile.name` 的 `name` 上, 记录的是 `user.profile.name`; 光标在 `user` 上, 记录的就是 `user`.

支持多光标. 一次调用的全部改动算**一个撤销步骤**, 文档永远不会被自动保存或格式化, 除日志本身以外不碰任何行.

### 快捷键

只有 **Insert Console Log** 带默认快捷键, 且限定在 `editorTextFocus && !editorReadonly`, 因此不会在只读编辑器外触发. 另两条刻意不给默认键, 避免与你现有的键位冲突.

在 `keybindings.json` 里自己绑定 — 重新绑定或取消 `Alt+L` 也是同样的写法:

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

### 配置

| 配置项 | 类型 | 默认值 | 作用域 |
| --- | --- | --- | --- |
| `editorConsoleToolkit.prefix` | `string` | `🎯🎯🎯 [DEBUG]` | `language-overridable` |

前缀会写进生成的消息, 让你的调试输出好找也好 grep. 每次执行都重新读取, 因此改了立即生效, 不需要重载窗口.

由于作用域是 `language-overridable`, 你可以按工作区, 按文件夹, 按语言分别覆盖:

```json
{
  "editorConsoleToolkit.prefix": "[debug]",
  "[python]": {
    "editorConsoleToolkit.prefix": "[py]"
  }
}
```

空前缀是合法的, 输出会变成 `user:` 而不是 `🎯🎯🎯 [DEBUG] user:`. 控制字符与换行会被静默剥离.

### 支持的语言

12 个适配器, 覆盖 15 个 languageId. 永远不添加 import — Java 与 C# 因此使用完全限定名.

| 语言 | languageId | 生成的语句 |
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

各语言的注意事项:

- **Rust** — 被记录的值必须实现 `Debug`. 没实现的话编译不过; 手动改掉 `{:?}` 或给类型 derive `Debug`.
- **Kotlin, Dart** — 表达式位于字符串插值内部, 因此含 `}` 的表达式可能需要手动修一下.
- **JSX / TSX** — 只支持普通语句行, 不会往 JSX 标记内部插入.
- **Ruby, Elixir, Kotlin, Dart, C#, Rust** — 前缀里对目标语言有特殊含义的字符 (`#`, `$`, `{`, `}`) 会被自动转义.

### 为什么不会动到你自己写的日志

每条生成的日志都带一个简短的尾部标记, 用目标语言的注释语法书写:

```js
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

```python
print('🎯🎯🎯 [DEBUG] user:', user) # ect:v1
```

这个标记是一行能被移除的**唯一**依据:

- 你手写的日志永远不会被移除, 即使看起来完全一样.
- 标记里不含前缀, 所以改了 `editorConsoleToolkit.prefix` 也不会让已插入的日志变成孤儿.
- 移除还要求日志紧跟在目标语句的下一行, 因此不同位置上同名变量的两条日志不会被搞混.

发布代码前把标记清掉 — 用切换命令关掉, 或者全工作区搜索 `ect:v1`. 标记在被注释后依然存在, **Toggle All Console Logs** 正是靠它找回你之前注释掉的日志.

### 什么情况下什么都不会发生

本插件拒绝猜. 遇到以下情况会给一条警告并且完全不改动文档:

- 选区跨越多行;
- 语句括号不配对, 字符串未闭合, 或长度超过 50 行;
- 光标在注释内;
- 光标在字符串字面量内;
- 光标处没有表达式;
- 该语言尚未支持.

其余情况一律插入到所属语句之后. 如果落点不理想, 一次撤销即可退回.

---

## Port Toolkit

点开活动栏的 **Port Toolkit** 图标. 视图列出每个正在监听本机端口的进程 — **一行一个进程, 而不是一行一个端口**:

```text
监听中的进程                              🗑  🔍  ⌫  ⧩  ⟳
  ☑ node                5173, 24678  ·  本工作区
      PID: 41802  ·  PPID: 41799  ·  sky
      运行时长: 12:33
      工作目录: ~/repo/web/apps/site
      监听于: TCP 0.0.0.0:5173  ·  TCP 127.0.0.1:24678
      命令行: node vite --host --port 5173
  ☑ node                3000  ·  本工作区
  ☐ java                8080
  🔒 Code Helper         6001  ·  编辑器自身
```

一个进程占多个端口时只占一行, 所以**你勾了几行, 就恰好终止几个进程** — 不会重复计数, 也不会有意外.

### 怎么区分进程

进程的启动位置落在你打开的某个工作区文件夹内时, 会显示 `本工作区` 标记. 这个标记是整个视图的意义所在: 同时有三个 `node` 在监听时, 工作目录才能告诉你哪个是你的.

展开一行 — 或把鼠标悬停在上面 — 可以看到其余信息:

| 字段 | 含义 |
| --- | --- |
| PID, PPID | 进程与父进程 ID |
| 用户 | 进程所属用户 |
| 运行时长 | 已经运行了多久 |
| 工作目录 | 从哪里启动的, home 目录下会缩写成 `~` |
| 监听于 | 全部监听端点, 含协议与绑定地址 |
| 命令行 | 完整命令行, 不截断 |

### 命令

在命令面板输入 `Port Toolkit`. 视图标题栏提供同样的操作. 这些命令**都不带默认快捷键**.

| 命令 | ID | 位置 |
| --- | --- | --- |
| Kill Checked Processes | `editorConsoleToolkit.ports.killSelected` | 🗑 标题栏, 命令面板 |
| Search Ports | `editorConsoleToolkit.ports.search` | 🔍 标题栏, 命令面板 |
| Clear Port Search | `editorConsoleToolkit.ports.clearSearch` | ⌫ 标题栏, 命令面板 |
| Toggle System Processes | `editorConsoleToolkit.ports.toggleSystemProcesses` | ⧩ 标题栏, 命令面板 |
| Refresh Ports | `editorConsoleToolkit.ports.refresh` | ⟳ 标题栏, 命令面板 |
| Kill Process | `editorConsoleToolkit.ports.killOne` | 行内悬停, 右键菜单 |

**批量终止.** 想勾多少行就勾多少行, 然后执行 **Kill Checked Processes**. 会弹出模态确认框, 逐个列出将被终止的进程, 结束后再汇总实际终止了几个. 勾选状态不会被自动刷新清掉, 所以你可以慢慢挑.

**搜索** 匹配进程名, 完整命令行, PID, 工作目录以及任一端口号 — `5173`, `vite` 与 `~/repo/web` 都能命中.

### 终止是怎么做的

先请进程自行退出 (`SIGTERM`), 只有在 `killTimeout` 之后仍然存活才强制结束 (`SIGKILL`). 处理了退出信号的 dev server 因此有机会关闭 socket 并清理临时文件.

四件它不会做的事:

- **不碰子进程.** 只终止你勾的那一行对应的进程.
- **不终止命令行已变化的进程.** 发出任何信号之前会重新读一次命令行. 从你勾选到点确认之间, 进程可能已经退出而 PID 被别的进程复用 — 一旦命令行不再匹配, 该行会被跳过并如实报告为已跳过, 而不是盲目终止.
- **永远不会终止你的编辑器.** 编辑器自身的进程带锁图标, 没有勾选框, 也没有终止动作. 这是从实时进程树推导出来的, 因此对任何兼容 VS Code 的编辑器都成立.
- **不会尝试提权.** 属于其他用户的进程会被列出并标注, 但无法终止.

### 刷新行为

视图**仅在可见时**按 `refreshInterval` 毫秒重新扫描. 切到其他活动栏图标, 计时器立即停止 — 你没在看它的时候不存在后台扫描. 把 `refreshInterval` 设为 `0` 则只在你主动触发时刷新.

开着两个端口和开着五十个端口, 一次扫描的开销是一样的. 扫描失败时视图显示单独一行错误项, 而不是弹通知 — 在轮询下每轮弹一次会把编辑器淹掉.

### 配置

| 配置项 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `editorConsoleToolkit.ports.refreshInterval` | `number` | `5000` | 视图可见时的重新扫描间隔, 单位毫秒. `0` 表示关闭自动刷新. |
| `editorConsoleToolkit.ports.killTimeout` | `number` | `3000` | 发出 `SIGTERM` 后等待多久升级为 `SIGKILL`. |
| `editorConsoleToolkit.ports.hideSystemProcesses` | `boolean` | `true` | 隐藏系统进程. |
| `editorConsoleToolkit.ports.systemPortMax` | `number` | `1024` | 视为系统端口的最大端口号. |
| `editorConsoleToolkit.ports.includeUdp` | `boolean` | `false` | 同时列出 UDP 端点, 而不只是 TCP 监听端口. |

一个进程被判为系统进程, 需要满足"从系统目录启动"**或**"其全部监听端口都不超过 `systemPortMax`". 只要有一个端口超过阈值就会保持可见, 因此占着 `8080` 的系统进程不会被静默隐藏.

### 平台支持

macOS, Linux 与 Windows.

> ⚠️ 目前只有 macOS 在真机上验证过. Linux 与 Windows 的支持已经实现并有测试覆盖, 但**尚未在真实的 Linux 或 Windows 机器上运行过** — 遇到不对的地方欢迎反馈.

当系统不肯说明某个 socket 属于哪个进程时 (Linux 上非 root 就会这样), 该行仍会被列出, 端口可见而所属标为未知, 而不是直接丢掉. 这样你至少知道端口被占了.

---

## 隐私与开销

- **无遥测, 无网络访问.** 关于你和你代码的任何信息都不会离开本机.
- **无运行时依赖.** 插件以单个打包文件发布.
- **Console Toolkit 是纯命令式的** — 没有监听器, 没有计时器, 没有状态栏项. 在你执行命令之前它什么都不做.
- **Port Toolkit 只在你看着它的时候工作.** 扫描计时器仅在其视图可见期间存在.

这些不只是口头承诺: 一旦 console 那一侧的代码里出现计时器, 监听器或常驻 UI 的 API, 构建就会失败.

## 疑难排查

| 现象 | 原因与处理 |
| --- | --- |
| `Alt+L` 没反应 | 该绑定要求 `editorTextFocus && !editorReadonly`. 在 **键盘快捷方式** 里搜 `alt+l` 看是否被占用. |
| 提示 "Console Toolkit 尚未支持该语言" | 该语言还没有适配器. 见 [支持的语言](#支持的语言) 与 [路线图](#路线图). |
| 某条日志切换不掉 | 它没有 `ect:v1` 标记, 或者已经不在目标语句的紧邻下一行. 手动删掉即可. |
| 端口视图是空的 | 可能所有监听项都被当作系统进程过滤掉了. 执行 **Toggle System Processes**, 或者调低 `systemPortMax`. |
| 某一行显示无法终止 | 它是你的编辑器, 编辑器自身的进程, 或属于其他用户. 见 [终止是怎么做的](#终止是怎么做的). |
| 出现 "端口扫描失败" 一行 | 系统拒绝了端口查询, 该行会显示系统给出的原因. |
| 端口列表看起来是旧的 | 视图只在可见时刷新. 点 ⟳, 或检查 `refreshInterval` 是不是 `0`. |

## 路线图

Console Toolkit 的语言支持分批推进, 因为每种语言都需要各自的处理才能保证安全, 而不是一套通用实现.

- **接下来** — shell / zsh, PowerShell, Perl, Go, C, C++, Scala, Groovy, Clojure, R; Vue, Svelte 与 Astro 的 `<script>` 块; notebook 单元格.
- **再往后** — SQL. 各方言没有统一的日志构造, 因此需要一个显式的方言配置, 而不是有风险的猜测.

Port Toolkit 的下一步是在真机上验证 Linux 与 Windows.

## 版本记录

见 [CHANGELOG.md](CHANGELOG.md).

## 许可证

[MIT](LICENSE.txt)
