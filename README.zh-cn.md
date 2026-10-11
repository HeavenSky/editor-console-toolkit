# Editor Console Toolkit

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/HeavenSky.editor-console-toolkit.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![Installs](https://vsmarketplacebadges.dev/installs-short/HeavenSky.editor-console-toolkit.svg)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-console-toolkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE.txt)

[English](./README.md) · **简体中文**

> 市场页只渲染英文版 README, 不随访问者的显示语言切换; 插件界面本身是双语的.

四件日常琐事, 一个插件, 零运行时依赖.

| | 做什么 | 在哪用 |
| --- | --- | --- |
| **控制台工具箱** (Console Toolkit) | 为光标处的表达式插入调试日志, 再一键把它 (或整个文件的日志) 关掉. 支持 15 种语言. | 命令面板, `Alt+L` |
| **端口工具箱** (Port Toolkit) | 查看哪些进程占着本机端口, 按启动位置区分它们, 并一次终止多个. | 活动栏 |
| **校验和工具箱** (Checksum Toolkit) | 改过编辑器自身的文件之后, 消掉"安装似乎已损坏"的警告; 想撤回时也能还原. | 命令面板 |
| **主题工具箱** (Theme Toolkit) | 在你指定的主题列表之间轮换颜色主题, 按时间段或系统外观切换深浅. | 设置, 命令面板 |

界面提供英文与简体中文, 跟随 VS Code 的显示语言.

> **本文按中文界面书写.** 命令名与视图名会跟随 VS Code 的显示语言, 下文表格里括号内给出英文界面下的名称, 便于对照. 命令 ID 与配置项 key 不随语言变化.

---

## 安装

- **VS Code** — 在扩展视图搜索 `Editor Console Toolkit`, 或在命令面板执行 `ext install HeavenSky.editor-console-toolkit`.
- **其他兼容 VS Code 的编辑器** — 从 [最新的 GitHub release](https://github.com/HeavenSky/editor-console-toolkit/releases) 下载 `.vsix`, 然后执行 **Extensions: Install from VSIX…**.

### 环境要求

VS Code `1.101.0` 或更高版本. 其他什么都不用装: 没有捆绑依赖, 运行时不下载任何东西, 端口工具箱读取端口用的是 macOS, Linux 与 Windows 自带的能力.

校验和工具箱还需要对编辑器自身安装目录的写权限. 拿不到写权限时 (Windows 与 Linux 上通常如此), 它会给你一条可以自己执行的命令, 而不是向你要密码.

---

## 快速开始

**记录一个变量.** 把光标放上去, 按 `Alt+L` (macOS 上是 `Option+L`):

```js
const user = getUser();
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

**提交前清理.** 执行 **控制台工具箱: 切换全部 Console 日志**, 把本插件在当前文件生成的日志全部注释掉 — 再执行一次就恢复. 任何时候都不会真的删除.

**释放一个端口.** 点开活动栏的 **端口工具箱** 图标, 找到带 `本工作区` 标记的那一行, 勾上它, 然后点视图标题栏的 🗑 按钮.

**消掉"安装似乎已损坏".** 改过编辑器自身的文件之后, 执行 **校验和工具箱: 修复校验和**, 然后完全退出编辑器再重新打开.

---

## 控制台工具箱 (Console Toolkit)

### 命令

在命令面板输入 `控制台工具箱` 即可找到全部三条.

| 命令 | ID | 快捷键 |
| --- | --- | --- |
| 插入 Console 日志 (Insert Console Log) | `editorConsoleToolkit.insertConsoleLog` | `Alt+L` |
| 切换 Console 日志 (Toggle Console Log) | `editorConsoleToolkit.toggleConsoleLog` | — |
| 切换全部 Console 日志 (Toggle All Console Logs) | `editorConsoleToolkit.toggleAllConsoleLogs` | — |

**插入 Console 日志** 为光标处的目标写入日志. 落在哪里取决于光标停在什么上:

| 光标停在 | 日志落在 |
| --- | --- |
| 开启一个块的行 — 函数签名, `if` / `for` 头, 回调体 | **块内**, 作为第一条语句, 缩进与块内其余行一致 |
| 开启一个装不了语句的块的行 — `switch`, `class`, Rust 的 `match` 与 `impl` | 该语句**之前**一行, 那里的值已经求过了 |
| 其它 | 所属语句之后, 无论这条语句跨多少行 |

重复执行第二次不会再插入.

**切换 Console 日志** 没有日志时插入, 已有时移除. 光标停在日志行本身时同样有效, 这是删掉一条日志最快的方式.

**切换全部 Console 日志** 把当前文件里生成的日志全部注释掉, 下次执行再取消注释:

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

只有 **插入 Console 日志** 带默认快捷键, 且限定在 `editorTextFocus && !editorReadonly`, 因此不会在可写编辑器之外触发. 另两条刻意不给默认键, 避免与你现有的键位冲突.

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
- 移除还要求日志紧贴在锚点的相邻一行, 因此不同位置上同名变量的两条日志不会被搞混.

发布代码前把标记清掉 — 用切换命令关掉, 或者全工作区搜索 `ect:v1`. 标记在被注释后依然存在, **切换全部 Console 日志** 正是靠它找回你之前注释掉的日志.

### 什么情况下什么都不会发生

本插件拒绝猜. 遇到以下情况会给一条警告并且完全不改动文档:

- 选区跨越多行;
- 语句括号不配对, 字符串未闭合, 或长度超过 50 行;
- 光标在块注释或跨行字符串内 (模板字符串, Python 三引号字符串);
- 光标在注释内;
- 光标在字符串字面量内;
- 光标处没有表达式;
- 该语言尚未支持.

其余情况一律落在上表三个位置之一. 语法无法判定时 — 比如一个含义分辨不出的孤立 `{` — 日志会落到整条语句之后而不是块内: 位置比你期望的偏外一些, 但绝不会写出坏语法. 如果落点不理想, 一次撤销即可退回.

---

## 端口工具箱 (Port Toolkit)

点开活动栏的 **端口工具箱** 图标. 视图列出每个正在监听本机端口的进程 — **一行一个进程, 而不是一行一个端口**. 第一行固定是搜索行:

```text
端口工具箱                                    🗑  ⧩  ⟳
  🔍 搜索                       例如 3000, node, ~/repo
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

有过滤时, 搜索行会显示过滤了什么, 藏掉了多少, 并带一个清空用的 ✕:

```text
端口工具箱                                    🗑  ⧩  ⟳
  🔍 搜索: 3000                已显示 7 项中的 2 项  ✕
  ☑ node                3000  ·  本工作区
  ☐ java                30001
```

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

在命令面板输入 `端口工具箱`. 视图标题栏提供同样的操作. 这些命令**都不带默认快捷键**.

| 命令 | ID | 位置 |
| --- | --- | --- |
| 终止已勾选的进程 (Kill Checked Processes) | `editorConsoleToolkit.ports.killSelected` | 🗑 标题栏, 命令面板 |
| 切换系统进程的显示 (Toggle System Processes) | `editorConsoleToolkit.ports.toggleSystemProcesses` | ⧩ 标题栏, 命令面板 |
| 刷新端口列表 (Refresh Ports) | `editorConsoleToolkit.ports.refresh` | ⟳ 标题栏, 命令面板 |
| 搜索端口 (Search Ports) | `editorConsoleToolkit.ports.search` | 点击搜索行, 命令面板 |
| 清除端口搜索 (Clear Port Search) | `editorConsoleToolkit.ports.clearSearch` | 搜索行上的 ✕ |
| 终止进程 (Kill Process) | `editorConsoleToolkit.ports.killOne` | 行内悬停 |

**批量终止.** 想勾多少行就勾多少行, 然后执行 **终止已勾选的进程**. 会弹出模态确认框, 逐个列出将被终止的进程, 结束后再汇总实际终止了几个. 勾选状态不会被自动刷新清掉, 所以你可以慢慢挑.

**搜索** 匹配进程名, 完整命令行, PID, 工作目录以及任一端口号 — `5173`, `vite` 与 `~/repo/web` 都能命中.

点搜索行即可输入. 列表边输边收敛 (停顿一下才生效), **回车** 保留过滤, **Esc** 把过滤退回打开输入框之前的样子. 有过滤时搜索行显示搜索词与匹配计数, 旁边的 ✕ 用来清空; 没有过滤时本来就没什么可清, 所以 ✕ 直接不出现.

有一点需要知道: **过滤不会清掉你的勾选**. 过滤之前勾上的进程, 即使这一行被过滤藏起来了也仍然是勾着的, **终止已勾选的进程** 会把它一起终止. 确认框始终逐个列出即将被终止的进程, 所以用过过滤之后请看一眼确认框.

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

## 校验和工具箱 (Checksum Toolkit)

改过 VS Code 自身的文件 (注入 CSS/JS, 调整界面) 之后, 下次启动它就会告诉你 **"安装似乎已损坏"**, 标题栏还带上 `[Unsupported]`: `product.json` 里记录的校验和与磁盘上的文件不再对得上. 这个功能域负责把校验和重算回去.

### 命令

| 命令 | ID |
| --- | --- |
| 修复校验和 (Fix Checksums) | `editorConsoleToolkit.checksums.apply` |
| 还原校验和 (Restore Checksums) | `editorConsoleToolkit.checksums.restore` |

两条命令都不带默认快捷键.

### 它是怎么做的

**修复校验和** 从当前运行的编辑器安装目录读取 `product.json`, 重算 `checksums` 里登记的每个文件的 SHA-256, 只写回真正不一致的那些条目. 登记了但磁盘上不存在的文件会被跳过并在提示里报出来, 而不是让整次修复失败. 没有任何差异时一个字节都不写.

首次写盘之前, 它会把 `product.json` **复制**一份到同目录的 `product.json.ect-orig.<版本号>`. 新内容先写到同目录的临时文件, 再 rename 覆盖 `product.json`, 因此中途被打断也不会留下被截断或干脆消失的 `product.json` — 那意味着编辑器再也起不来.

**还原校验和** 把那份备份写回去, 成功之后才删掉备份.

> **还原回到的是本插件首次修复之前的状态, 不是出厂状态的 `product.json`.** 如果在那之前校验和已经被别的工具改过, 备份记录下来的就是那个样子. 备份也没有了的时候, 回头路是重装编辑器 — 你的设置与已装插件都不在安装目录里, 重装不会丢.

两条命令执行完都需要**完全退出编辑器再重新打开**. 重载窗口不生效.

执行其中任一条时还会顺手清掉留给**其它**编辑器版本的备份 — 只清本插件自己写的 (`product.json.ect-orig.*`), 绝不碰那个目录里的其他任何文件.

### 安装目录不可写时

Windows 与 Linux 上, 安装目录通常只有管理员才能写. **本插件从不提权.** 它会把修好的 `product.json` 写到你的临时目录, 并把唯一需要执行的那条命令交给你:

```sh
sudo cp "…/product.json" "…/product.json.ect-orig.1.132.0" && sudo cp "/tmp/editor-console-toolkit/product.json" "…/product.json"
```

提示上带一个 **复制命令** 按钮, 点一下就进剪贴板. Windows 上是同一条命令的 `copy /Y …` 写法, 在具备管理员权限的终端里执行.

### 适用范围与平台支持

macOS, Linux 与 Windows, 以及安装结构相同的 VS Code 兼容编辑器 (Cursor, VSCodium, Windsurf) — 目录取自当前运行的编辑器, 不靠猜.

> ⚠️ 与端口工具箱一样, 目前只在 macOS 真机上验证过.

在 Remote (SSH, WSL, 容器) 窗口或 Web 端, 两条命令会带着原因拒绝执行: 那里的扩展宿主并不是你眼前这个编辑器所在的机器.

**改核心文件本身不是本插件的职责** — 它只负责让编辑器不再为你已经做过的改动报警. 编辑器升级会把 `product.json` 换掉, 所以升级之后要再执行一次 **修复校验和**. 改动核心文件本身是官方不支持的行为; 用它就意味着你清楚自己在做什么.

---

## 主题工具箱 (Theme Toolkit)

在你指定的主题列表之间轮换颜色主题 — 例如每到整点换一个 — 并按时间段或操作系统外观在深色列表与浅色列表之间切换. 列表里可以填 **任何已安装的主题**; 默认是 [Editor Comfort Theme](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-comfort-theme) 的 8 个主题, 当前主题不在列表里时什么都不做.

### 命令

| 命令 | ID |
| --- | --- |
| 下一个主题 (Next Theme) | `editorConsoleToolkit.themes.next` |

立即换到同类的下一个已安装主题. 没有默认快捷键.

### 配置

| 配置项 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `editorConsoleToolkit.themes.enabled` | `boolean` | `true` | 开启或关闭轮换. |
| `editorConsoleToolkit.themes.interval` | `number` | `60` | 轮换间隔(分钟), 按本地时钟对齐. 小于 `30` 表示不轮换, 只切换深浅; 大于 `20160`(两周)按两周计. |
| `editorConsoleToolkit.themes.darkThemes` | `string[]` | Comfort 的 4 个深色主题 | 参与轮换的深色主题, 按顺序轮换, 填 **首选项: 颜色主题** 里显示的名字. |
| `editorConsoleToolkit.themes.lightThemes` | `string[]` | Comfort 的 4 个浅色主题 | 参与轮换的浅色主题, 按顺序轮换. |
| `editorConsoleToolkit.themes.appearance` | `string` | `schedule` | `schedule` 按 `lightTime` / `darkTime` 切换深浅; `system` 跟随系统外观(macOS, Windows, 以及通过 XDG desktop portal, GNOME 或 KDE 设置识别的 Linux), 每 10 分钟与窗口重新获得焦点时重新检查; `keep` 保持当前深浅. |
| `editorConsoleToolkit.themes.lightTime` | `string` | `09:00` | `schedule` 时切到浅色列表的时刻. |
| `editorConsoleToolkit.themes.darkTime` | `string` | `18:00` | `schedule` 时切到深色列表的时刻. |

### 它是怎么决定的

- **只管列表里的主题.** 换成两个列表都没有的主题(任何插件或 VS Code 自带的) 会暂停轮换, 设置不变; 再换回列表里的主题就从它接着轮. 把当前主题从列表里删掉效果相同.
- **跳过没安装的主题.** 写入主题前先检查是否已安装, 没装就取列表里下一个已安装的; 要切去的列表一个都没装时本时段保持当前主题, 装上主题, 修改设置或进入下一个时段后自动恢复 — 所以只填深色列表时白天会一直保持深色主题.
- **启动不闪.** 加载时当前主题的深浅符合要求就保留, 视为本时段的主题并从它接着轮; 只有深浅不符(例如早上仍是深色)才立即切换.
- **手动选的列表主题** 保留到下一个切换时间点, 之后从它的下一个接着轮.
- **多窗口每个时段只换一次.** 各窗口按时钟算出同一个主题, 只有获得焦点的窗口计时; 后台窗口休眠, 重新获得焦点时补判.
- **工作区设置优先.** 轮换只写用户级 `workbench.colorTheme`. 主题由工作区设置(`.vscode/settings.json` 或 `.code-workspace` 文件) 决定的窗口仍显示工作区主题, 但获得焦点时照常驱动用户级主题轮换; 修改工作区主题不算手动选择, **下一个主题** 在该窗口不生效. `window.autoDetectColorScheme` 会覆盖 `workbench.colorTheme`, 使用本功能需将其关闭.
- **远程窗口不参与**, 因为那里的时钟, 时区与系统外观属于远程机器; 由本机窗口负责切换.

---

## 隐私与开销

- **无遥测, 无网络访问.** 关于你和你代码的任何信息都不会离开本机.
- **无运行时依赖.** 插件以单个打包文件发布.
- **控制台工具箱是纯命令式的** — 没有监听器, 没有计时器, 没有状态栏项. 在你执行命令之前它什么都不做.
- **端口工具箱只在你看着它的时候工作.** 扫描计时器仅在其视图可见期间存在.
- **主题工具箱只在获得焦点的窗口里挂一个定时器.** 最多每 5 分钟醒一次, 只在 `appearance` 为 `system` 时, 于切换时间点, 每 10 分钟, 窗口重新获得焦点或修改设置时读取系统外观; 后台窗口与远程窗口什么都不做.
- **校验和工具箱只在你执行它的时候碰磁盘.** 没有启动扫描, 不提权, 除了编辑器自身的安装目录与你的临时目录之外不写任何地方.

这些不只是口头承诺: 一旦 console 那一侧的代码里出现计时器, 监听器或常驻 UI 的 API, 构建就会失败.

## 疑难排查

| 现象 | 原因与处理 |
| --- | --- |
| `Alt+L` 没反应 | 该绑定要求 `editorTextFocus && !editorReadonly`. 在 **键盘快捷方式** 里搜 `alt+l` 看是否被占用. |
| 提示 "Console Toolkit 尚未支持该语言" | 该语言还没有适配器. 见 [支持的语言](#支持的语言) 与 [路线图](#路线图). |
| 某条日志切换不掉 | 它没有 `ect:v1` 标记, 或者已经不在锚点的紧邻一行. 手动删掉即可. |
| 端口视图是空的 | 可能所有监听项都被当作系统进程过滤掉了. 执行 **切换系统进程的显示**, 或者调低 `systemPortMax`. |
| 某一行显示无法终止 | 它是你的编辑器, 编辑器自身的进程, 或属于其他用户. 见 [终止是怎么做的](#终止是怎么做的). |
| 出现 "端口扫描失败" 一行 | 系统拒绝了端口查询, 该行会显示系统给出的原因. |
| 端口列表看起来是旧的 | 视图只在可见时刷新. 点 ⟳, 或检查 `refreshInterval` 是不是 `0`. |
| 执行了 **修复校验和** 但"安装似乎已损坏"还在 | 重载窗口不生效 — 要完全退出编辑器再重新打开. 如果过一段时间又出现, 说明编辑器升级重写了 `product.json`, 再执行一次即可. |
| 提示"没有编辑器安装目录的写入权限" | Windows 与 Linux 上属正常情况. 修好的文件已暂存到临时目录, 用提示里的 **复制命令** 拿到命令, 在具备管理员权限的终端里执行. |

## 路线图

控制台工具箱的语言支持分批推进, 因为每种语言都需要各自的处理才能保证安全, 而不是一套通用实现.

- **接下来** — shell / zsh, PowerShell, Perl, Go, C, C++, Scala, Groovy, Clojure, R; Vue, Svelte 与 Astro 的 `<script>` 块; notebook 单元格.
- **再往后** — SQL. 各方言没有统一的日志构造, 因此需要一个显式的方言配置, 而不是有风险的猜测.

端口工具箱与校验和工具箱的下一步都是在真机上验证 Linux 与 Windows — 端口解析器与"安装目录不可写"这条路径都已实现且有测试覆盖, 但只在 macOS 上真跑过.

## 版本记录

见 [CHANGELOG.md](./CHANGELOG.md).

## 许可证

[MIT](./LICENSE.txt)

校验和工具箱是重写实现, 但行为源自 [vscode-fix-checksums](https://github.com/RimuruChan/vscode-fix-checksums) — MIT © Jürg Lehni 2018, MIT © RimuruChan 2024. 本仓库不包含它的任何代码与依赖.
