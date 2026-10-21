# 更新日志

[English](../CHANGELOG.md) · **简体中文**

## v0.0.7 2026-10-16 文档重写

### 变更

- 文档：README 改为简短的概览页，每个工具箱配一张截图；完整用法、设置与故障排查移到[使用文档](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/zh/docs/README.md)，中文页面统一放在 `zh/` 下。

## v0.0.6 2026-10-15 移除主题工具箱

### 移除

- 移除**主题工具箱**：`editorConsoleToolkit.themes.*` 设置与「下一个主题」命令不再存在，插件也不再切换颜色主题。`settings.json` 里残留的这些设置已不起作用，可以放心删除。想跟随系统外观，用 VS Code 自带的 `window.autoDetectColorScheme`。

### 变更

- 插件不再随启动激活，只在执行命令或打开端口工具箱视图时激活。

## v0.0.5 2026-10-12 主题工具箱

新增第四个功能：**主题工具箱**，按时间轮换颜色主题。

### 新增

- **主题轮换**（`editorConsoleToolkit.themes.*`，默认开启）：按本地时钟每隔 `interval` 分钟（默认 60；小于 30 不轮换，超过两周按两周计）在 `darkThemes` / `lightThemes` 列出的主题之间轮换；深浅色在 `lightTime` / `darkTime` 时刻切换，或跟随系统外观（macOS、Windows，以及通过 XDG desktop portal、GNOME 或 KDE 设置识别的 Linux；每 10 分钟及窗口重新获得焦点时检查）。列表可以填任何已安装的主题，默认是 Editor Comfort Theme 的 16 个主题。
- 没安装的主题会被跳过；要切换到的那一类主题一个都没安装时，留在当前深浅类别的列表里继续轮换，直到装上为止。
- 手动选了列表外的主题会暂停轮换，设置不变；选回列表里的主题，就从这个主题继续轮换。启动时只在深浅类别不对时才切换。只写入用户级主题：主题由工作区设置决定的窗口保持工作区主题，但仍会推动轮换；后台窗口与远程窗口从不切换。
- 「下一个主题」（`editorConsoleToolkit.themes.next`）：立即轮换到下一个。

### 变更

- 文档：README 为每个功能配了截图。图片在浏览页面时从 GitHub 加载，不打包进插件。

### 修复

- 端口工具箱视图改为声明自己的图标，拖到别的视图容器或面板后图标仍然正常。
- 函数声明的返回类型以 `>`、`]` 或 `}` 结尾时（例如 `function load(): Promise<User> {`、`(): User[] {`、`(): { type: string } {`），「插入 Console 日志」不再把日志插到整个函数之后。Rust 的 `-> Result<T, E> {`、Swift 的 `throws -> [Int] {` 和 Kotlin 的 `: Int? {` 签名同样修复。

## v0.0.4 2026-08-12 校验和工具箱

新增第三个功能：**校验和工具箱**，改过编辑器核心文件后消掉「安装似乎已损坏」警告。

### 新增

- 「修复校验和」（`editorConsoleToolkit.checksums.apply`）：只重写当前运行的编辑器 `product.json` 里与磁盘文件对不上的校验和（[用法](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/zh/docs/checksums.md#修复校验和)）。
- 「还原校验和」（`editorConsoleToolkit.checksums.restore`）：先把备份写回，成功后才删除备份，中途失败也不会两个文件都没了。
- 第一次写入前先把原文件**复制**为 `product.json.ect-orig.<version>` 作为备份；运行中断也不会留下被截断或缺失的 `product.json`（[磁盘上改了什么](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/zh/docs/checksums.md#磁盘上改了什么)）。
- **从不提权。** 安装目录不可写时（通常是 Windows 和 Linux），通知里会给出一条命令，由你自己执行（[详情](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/zh/docs/checksums.md#安装目录不可写时)）。
- 执行任一命令时，会清理*其他*编辑器版本留下的备份。只删除本插件自己写的文件（`product.json.ect-orig.*`）。
- 扩展宿主不在编辑器所在的机器上时，两个命令都拒绝执行并说明原因：远程窗口（SSH、WSL、容器）、网页版，以及编辑器报告不出安装目录的任何情况。
- 新增 36 个测试：用固定向量校验校验和算法，用内存文件系统覆盖修复与还原的执行顺序、权限被拒与部分失败等路径；测试总数 344 个。

### 说明

- **执行任一命令后都要完全退出并重启编辑器。** 重新加载窗口不会生效；这是编辑器自检方式决定的，插件绕不过去。
- **还原回到的是本插件第一次修复之前的状态，不是出厂时的 `product.json`。** 如果校验和之前已被别的工具改过，备份里存的就是那个状态。备份没了的话，只能重装编辑器。
- 第一次修复会重排 `product.json` 的格式：经过一次 JSON 解析与序列化，编辑器自带的单行短数组会被展开，文件大约变大 4KB。数据等价，逐字节一致的原文件在备份里。
- 编辑器升级会替换 `product.json`，警告会再次出现，需要重新执行「修复校验和」；插件不会自动检测到升级。
- 不负责修改核心文件本身，只让编辑器不再为你已经做过的修改报警。
- 依旧没有运行时依赖、没有遥测、不联网，激活时什么也不做：新命令只在你执行时才读写磁盘。
- **只在 macOS 上验证过。** Windows 与 Linux 的路径（包括安装目录不可写的流程）已实现并有测试覆盖，但没在真实的 Windows 或 Linux 机器上跑过。
- 行为参考 [vscode-fix-checksums](https://github.com/RimuruChan/vscode-fix-checksums)：MIT © Jürg Lehni 2018，MIT © RimuruChan 2024。用 TypeScript 从头重写，没有打包它的任何代码，也没有打包它的 `sudo-prompt` / `tmp` 依赖。署名写在 README 的许可证一节。

## v0.0.3 2026-08-10 日志插入位置

重做插入日志的落点，端口视图的搜索改为常驻的一行。

### 新增

- **日志插进它所属的块里。** 光标在函数签名、`if` / `for` 条件行或回调函数体上时，日志成为块内第一条语句，不再落到整个结构之后（[落点规则](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/zh/docs/console-logs.md#日志插在哪里)）。
- 块里不能放语句时（`switch`、`class`，Rust 的 `match` 与 `impl`），日志插在这条语句的**前一行**，此时要记录的值已经求出。
- 端口工具箱视图第一行**常驻搜索行**：有过滤条件时显示搜索词、`已显示 7 项中的 2 项` 这样的匹配数，以及用来清除的 ✕（[搜索说明](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/zh/docs/ports.md#搜索列表)）。
- 新增 13 个回归用例覆盖各支持语言的插入位置，并新增一组词法分析测试；测试总数 305 个。

### 变更

- 端口视图从「监听中的进程」改名为「端口工具箱」，与所在的视图容器同名。
- 「搜索端口」与「清除端口搜索」移出视图标题栏：搜索就是那一行，清除就是行上的 ✕。两个命令仍在命令面板里，也仍可绑定快捷键。
- 块语法改为从各语言的适配器读取，不再默认按类 C 语言处理；Python 的缩进块以及 Ruby、Lua、Elixir 的 `do` / `end` 块因此能落到正确位置。
- 删除日志时要求日志紧挨着它的锚点所在行，因为日志不再总是在语句*之后*。

### 修复

- 现在能识别光标位于**多行字符串或块注释**内：在模板字符串、Python 三引号字符串或 `/* … */` 内部时拒绝插入，不会把日志写进字面量中间。以前只识别单行注释和字符串。
- 为**多行调用**的某个参数插入日志时，缩进取自参数所在的行，与收尾的 `);` 对不齐。现在缩进取自语句的第一行。
- `if (input.type === "file") {` 被当成了受限块，因为受限块关键字连**属性名**也会匹配，凡是条件里带 `.type` 的，日志都被挪到语句之前。现在属性访问不再匹配。

### 说明

- **过滤不会清除勾选。** 过滤前勾选的进程，即使行被过滤隐藏，也仍处于勾选状态，「终止已勾选的进程」会终止它。确认对话框总会列出即将终止的全部进程。
- 语法确实有歧义时（例如单独一个 `{`，无法判断含义），日志退回到插在整条语句之后：位置可能比你想要的靠外，但语法永远不会被破坏。
- 依旧没有运行时依赖、没有遥测、不联网。

## v0.0.2 2026-08-07 端口工具箱

新增第二个功能：**端口工具箱**，查看哪些进程占着本机端口，并批量终止。

### 新增

- 活动栏新增**端口工具箱视图**，列出所有监听本机端口的进程。**每个进程一行**，不是每个端口一行：占了好几个端口的进程只占一行，勾选的行数始终等于将被终止的进程数。
- 用于区分进程的来源信息：PID、PPID、所有者、运行时长、工作目录、所有监听端点，以及不截断的完整命令行。进程是从你打开的某个工作区文件夹里启动时，显示 `本工作区` 标记，同时跑着三个 `node` 开发服务器时就靠它区分。
- 用原生复选框**批量终止**：勾选任意多行，再执行「端口工具箱：终止已勾选的进程」（[步骤](https://github.com/HeavenSky/editor-console-toolkit/blob/HEAD/zh/docs/ports.md#终止进程)）。
- 先发 `SIGTERM`，超过 `editorConsoleToolkit.ports.killTimeout` 后才升级为 `SIGKILL`，让开发服务器有机会关闭套接字。从不碰子进程（Windows 上调用 `taskkill` 时不带 `/T`）。
- 发送信号前会再次核对命令行。勾选之后进程已退出且 PID 被复用的，这一行会被跳过并报告为已跳过，不会盲目终止。
- **编辑器自身永远无法被终止。** 启动时从实时进程树推出从扩展宿主到编辑器主进程的父进程链，链上每个进程都显示锁形图标，没有复选框，也没有终止操作。因为依据的是进程树而不是进程名单，VS Code、Cursor、Windsurf 等衍生编辑器同样适用。
- 其他用户的进程会列出，但标为不可终止，因为插件不会提权。
- 可按进程名、完整命令行、PID、工作目录和任意端口号搜索；可过滤系统进程；可手动刷新。
- `editorConsoleToolkit.ports.*` 下新增 5 个设置：`refreshInterval`（默认 `5000`，`0` 关闭自动刷新）、`killTimeout`（`3000`）、`hideSystemProcesses`（`true`）、`systemPortMax`（`1024`）、`includeUdp`（`false`）。
- 「插入 Console 日志」新增默认快捷键 `Alt+L`，仅在 `editorTextFocus && !editorReadonly` 时生效。

### 变更

- 新图标：一个终端窗口里有两行输出，一行变暗表示已注释，一行高亮，下方是三盏状态灯。原来的 `>` 提示符图标归 Editor Lang Toolkit 使用；两个插件在插件列表里挨着，必须一眼能分开。

### 说明

- 视图**只在可见时**重新扫描；切到活动栏的其他图标就停止计时，你不看的时候没有后台扫描。不论开着多少端口，一次扫描固定执行三条命令。
- 扫描失败时只在视图里显示一行错误，不弹通知，因为轮询时每次都弹通知会把编辑器淹没。
- 依旧没有运行时依赖、没有遥测、不联网。
- 端口工具箱的命令都没有默认快捷键。
- 端口与进程信息在 macOS 上用 `lsof` 采集，Linux 上用 `ss`（不可用时退回 `netstat`），Windows 上用 PowerShell。**Linux 与 Windows 的解析有固定样本测试覆盖，但没在真实的 Linux 或 Windows 机器上验证过。**

## v0.0.1 2026-08-05

首次发布。

### 新增

- 「插入 Console 日志」（`editorConsoleToolkit.insertConsoleLog`）：为选中的表达式或光标处的表达式，在所在语句的下一行插入调试日志。
- 「切换 Console 日志」（`editorConsoleToolkit.toggleConsoleLog`）：没有日志时插入，已有时删除；光标就在日志行上时也会删除这条日志。
- 「切换全部 Console 日志」（`editorConsoleToolkit.toggleAllConsoleLogs`）：注释掉当前文件里所有生成的日志，再执行一次就取消注释。不删除任何内容，保留缩进；文件里注释与未注释混杂时，第一次执行统一变为全部注释。
- 支持 12 个语言适配器，覆盖 15 种语言 ID：JavaScript、JSX、TypeScript、TSX、Python、Java、Kotlin、C#、Lua、Ruby、PHP、Swift、Dart、Rust 和 Elixir。
- `editorConsoleToolkit.prefix` 设置（默认 `🎯🎯🎯 [DEBUG]`），作用域为 `language-overridable`，可以按工作区、文件夹和语言分别覆盖。
- 支持多光标。一次命令执行的所有改动只占一步撤销，从不自动保存或格式化文档。
- 生成的日志带一个简短的归属标记（`// ect:v1`），插件只删除自己生成的日志，改了前缀之后也能照常删除。
- 界面支持英文和简体中文，跟随 VS Code 的显示语言。

### 说明

- 没有提供默认快捷键，请在键盘快捷方式里自行绑定这三个命令。
- 插件没有运行时依赖、没有遥测、不联网，也没有后台监听。只在执行它的两个命令之一时激活。
