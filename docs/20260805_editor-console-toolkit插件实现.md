# Editor Console Toolkit 实现方案

- 方案状态: 已完成

本文记录 `editor-console-toolkit` 的设计取舍, 公共契约与实现细节, 面向后续维护者与贡献者. 用户视角的使用说明见 `README.md`.

## 1. 目标与验收标准

一个只做一件事的 VS Code 扩展: 在多种语言里插入, 切换和批量静音调试输出语句. 零运行时依赖, 零常驻 UI, 零遥测.

首版验收标准, 全部已达成:

- 包名 `editor-console-toolkit`, 展示名 `Editor Console Toolkit`, publisher `HeavenSky`, MIT License.
- 三条命令, 面板中显示为 `Console Toolkit: Insert Console Log` / `Toggle Console Log` / `Toggle All Console Logs`.
- Toggle 在目标位置没有本扩展日志时插入, 已存在时精确移除.
- Toggle All 注释或取消注释当前文件里全部本扩展日志, 不删除任何行.
- 提供 `editorConsoleToolkit.prefix` 配置, 默认值 `🎯🎯🎯 [DEBUG]`.
- 命令出现在 Command Palette, 但不贡献任何默认快捷键.
- 支持多光标; 同一次命令的全部变更形成一个可撤销编辑; 不自动保存文件.
- 支持第 6 节列出的 12 个适配器 / 15 个 languageId.
- 不创建侧边栏, 活动栏, 状态栏, Webview, 树视图或编辑器装饰.
- 不注册后台文件监听, 定时器, 启动扫描或配置变更监听.
- 运行时不访问网络, 不收集遥测, 不读写全局状态, 不依赖 Git.
- 未显式运行命令时扩展不激活; 运行命令后也不常驻额外资源.
- 对不支持的语言或明显不安全的上下文拒绝生成代码, 不猜测语法.
- 首版不建设自动化测试; 质量门是 `tsc --noEmit` + 静态负向检查 + 人工验收.

## 2. 设计前提

三条判断决定了整体架构:

1. **必须基于编辑器内存文本工作, 不能读磁盘.** 未保存的缓冲区与磁盘内容不一致, 任何 `fs.readFileSync` 式的日志检测都会在 dirty document 上给出错误结果. 因此全部计算基于 `document.getText()` 的一次性快照.
2. **不能用显示前缀识别自己的日志.** 用户随时可能修改 `prefix`, 一旦以当前前缀作为识别依据, 改前缀后此前插入的日志就变成无法移除的孤儿. 因此需要一个与显示文本无关的稳定所有权标记.
3. **"支持所有常见语言"不能一次性承诺.** 各语言在 import 管理, 格式串, 类型系统, 插值语法和方言上差异巨大. 强行用一个通用模板兜底只会产出不能编译的代码. 因此按适配器能力分层交付.

技术依据:

- [Extension Guides: Command](https://code.visualstudio.com/api/extension-guides/command)
- [Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [Contribution Points: configuration](https://code.visualstudio.com/api/references/contribution-points#contributes.configuration)
- [When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)

## 3. 范围与约束

### 3.1 首版范围

- 只处理当前活动文本编辑器.
- 只处理显式单行选择, 或光标下可提取的表达式.
- 插入点为目标表达式所属完整逻辑语句的下一行, 沿用锚点行缩进.
- 只操作带有 `ect:v1` 所有权标记的日志.
- 不删除用户手写的 `console.log`.
- Prefix 影响之后生成的可见文本, 不影响已插入日志的移除能力.

### 3.2 明确排除

- 工作区级日志扫描, 跨文件批量清理, 提交前 Hook, Git 集成.
- 侧边栏, 活动栏, 状态栏, Webview, 树视图, 促销或发布说明弹窗.
- 遥测, 网络请求, 用户行为计数, 全局状态.
- 默认快捷键和右键菜单.
- 自动保存, 自动格式化, 修改用户的任何其他代码行.
- **全部自动化测试**: 不做单元测试, 不做 Extension Host 集成测试, 不做性能测试.
- AST 完整语句定位, 跨行复杂表达式, import/include 自动管理.

### 3.3 许可证与仓库

- MIT License, `LICENSE.txt` 版权行 `Copyright (c) 2026 HeavenSky`.
- 仓库 `https://github.com/HeavenSky/editor-console-toolkit`, homepage 与 bugs URL 由同一仓库派生.
- 发布由 `.github/workflows/release.yml` 驱动, 见 §11.

## 4. 工程和工具链

- TypeScript, 开启 `strict` 与 `noUnusedLocals`.
- esbuild 通过 `build.mjs` 输出单文件 `out/extension.js`, `format: cjs`, `target: node18`, `external: ['vscode']`; 开发构建带 sourcemap, `--production` 时 minify.
- `tsc --noEmit` 做类型检查.
- npm 与 `package-lock.json` 管理依赖.
- `@vscode/vsce` 检查包内容并生成 VSIX.
- `package.nls.json` / `package.nls.zh-cn.json` 本地化清单文案, `l10n/bundle.l10n.zh-cn.json` 本地化运行时提示.
- `.vscode/launch.json` 与 `.vscode/tasks.json` 提供 Extension Host 调试; `tasks.json` 含 `compile`, `watch`, `typecheck` 三项.
- `scripts/render-icon.mjs` 用 node 内置 `zlib` 直接输出 256x256 PNG: 图形以圆角矩形, 圆形与胶囊三种解析式原语在脚本内定义, 4x4 超采样抗锯齿. **脚本不解析 SVG**, `media/icon.svg` 是手工维护的同形副本, 改图形时两者必须一起改.

`package.json` 脚本:

```json
{
  "compile": "node ./build.mjs",
  "watch": "node ./build.mjs --watch",
  "typecheck": "tsc --noEmit -p ./",
  "icon": "node ./scripts/render-icon.mjs media/icon.png",
  "package": "npm run typecheck && vsce package",
  "vscode:prepublish": "node ./build.mjs --production"
}
```

`dependencies` 为空. `devDependencies` 只有 5 项:

```json
{
  "@types/node": "^20.19.0",
  "@types/vscode": "~1.80.0",
  "@vscode/vsce": "^3.9.2",
  "esbuild": "^0.28.1",
  "typescript": "^5.9.3"
}
```

运行时零第三方依赖, 因此不需要 `THIRD_PARTY_NOTICES.md`.

`.vscodeignore`:

```text
.vscode/**
.github/**
src/**
scripts/**
docs/**
out/**/*.map
node_modules/**
build.mjs
tsconfig.json
.gitignore
**/*.vsix
```

`.github/**` 必须显式列出: vsce 的 `defaultIgnore` 里虽有 `.github`, 但文件是以 `.github/workflows/release.yml` 这样的完整路径参与 minimatch 的, 裸 `.github` 匹配不到. 同理 `.ai-ctx/**` 也不能省 —— vsce 的文件收集用 `glob('**', { dot: true })`, 点目录不会被自动跳过.

`.gitignore` 需要 `!.vscode/` 与 `!.github/` 两条反忽略: 若全局 gitignore 含 `.*/` 之类规则, 这两个目录会被整体忽略掉.

目录结构:

```text
.
├── package.json
├── package-lock.json
├── tsconfig.json
├── build.mjs
├── .gitignore
├── .vscodeignore
├── .vscode
│   ├── launch.json
│   └── tasks.json
├── .github
│   └── workflows
│       └── release.yml
├── README.md
├── CHANGELOG.md
├── LICENSE.txt
├── package.nls.json
├── package.nls.zh-cn.json
├── docs
├── l10n
│   └── bundle.l10n.zh-cn.json
├── media
│   ├── icon.svg
│   └── icon.png
├── scripts
│   └── render-icon.mjs
├── src
│   ├── extension.ts
│   ├── commands
│   │   ├── runner.ts
│   │   ├── insertConsoleLog.ts
│   │   ├── toggleConsoleLog.ts
│   │   └── toggleAllConsoleLogs.ts
│   ├── core
│   │   ├── types.ts
│   │   ├── snapshot.ts
│   │   ├── selectionResolver.ts
│   │   ├── statementScanner.ts
│   │   ├── logMarker.ts
│   │   └── planEdits.ts
│   └── languages
│       ├── languageAdapter.ts
│       ├── templateAdapter.ts
│       ├── escape.ts
│       ├── registry.ts
│       └── adapters
│           ├── javascript.ts
│           ├── python.ts
│           ├── java.ts
│           ├── kotlin.ts
│           ├── csharp.ts
│           ├── lua.ts
│           ├── ruby.ts
│           ├── php.ts
│           ├── swift.ts
│           ├── dart.ts
│           ├── rust.ts
│           └── elixir.ts
└── out
    └── extension.js
```

分层约束: `src/core/**` 与 `src/languages/**` 全部为纯函数, **不 import `vscode`**. 只有 `src/commands/**` 与 `src/extension.ts` 接触编辑器 API. `TextDocument` 到基本类型的转换发生在 `src/commands/runner.ts`.

## 5. 扩展清单和公共契约

### 5.1 扩展身份

- `name`: `editor-console-toolkit`
- `displayName`: `Editor Console Toolkit`
- `description`: `%extension.description%`
- `version`: `0.0.1`
- `publisher`: `HeavenSky`
- `license`: `MIT`
- `repository`: `{ "type": "git", "url": "https://github.com/HeavenSky/editor-console-toolkit.git" }`
- `homepage`: `https://github.com/HeavenSky/editor-console-toolkit`
- `bugs`: `{ "url": "https://github.com/HeavenSky/editor-console-toolkit/issues" }`
- `icon`: `media/icon.png`
- `main`: `./out/extension.js`
- `l10n`: `./l10n`
- `engines.vscode`: `^1.80.0`. VS Code 自 1.74 起为 `contributes.commands` 自动生成激活事件, 因此不写 `activationEvents`.
- `categories`: `["Debuggers", "Other"]`
- `keywords`: `["console", "log", "debug", "toggle log", "multi language", "developer tools"]`
- 命令与配置命名空间均为 `editorConsoleToolkit`.

### 5.2 命令

```text
editorConsoleToolkit.insertConsoleLog
editorConsoleToolkit.toggleConsoleLog
editorConsoleToolkit.toggleAllConsoleLogs
```

三条命令的 `title` 与 `category` 使用 `%...%` 占位符. 不声明 `menus`, `views`, `viewsContainers`, `activationEvents`, `extensionDependencies`.

`contributes.keybindings` 只声明一条: `editorConsoleToolkit.insertConsoleLog` 绑 `alt+l`, `when` 为 `editorTextFocus && !editorReadonly`. 另两条命令刻意不给默认键, 减少与用户既有键位冲突的面积.

`when` 与 `enablement` 不同: 前者只影响按键分派, 不参与命令面板的候选过滤, 因此不会重现下面那个坑. 命令会写文档, 所以必须带 `!editorReadonly`, 避免在只读编辑器里触发空操作.

**不要给命令加 `enablement`.** 命令面板的 `getGlobalCommandPicks()` 对候选执行 `.filter(action => action instanceof MenuItemAction && action.enabled)` —— `enablement` 为 false 的命令是被**完全丢弃**而非置灰. 判定使用 `activeEditorPane.scopedContextKeyService`, 而 `editorTextFocus` 由编辑器文本区的 focus/blur 驱动(`onDidBlurEditorText` → `_updateFromFocus`, 默认 false). 命令面板一打开, 编辑器文本区即失焦, 该键必为 false. 因此 `"enablement": "editorTextFocus"` 会让命令**永远不出现在面板里**. 安全性由运行时兜底: 没有活动编辑器或语言不支持时各给一条 warning.

清单本地化 key 固定为 6 个, 两个 nls 文件 key 集必须完全一致且无未使用 key:

| key | English | 简体中文 |
| --- | --- | --- |
| `extension.description` | `Insert and safely toggle debug console statements across multiple programming languages.` | `为多种编程语言插入并安全切换调试输出语句.` |
| `category` | `Console Toolkit` | `控制台工具箱` |
| `command.insertConsoleLog` | `Insert Console Log` | `插入 Console 日志` |
| `command.toggleConsoleLog` | `Toggle Console Log` | `切换 Console 日志` |
| `command.toggleAllConsoleLogs` | `Toggle All Console Logs` | `切换全部 Console 日志` |
| `config.prefix` | `Prefix included in generated console log messages.` | `生成的 Console 日志消息中包含的前缀.` |

`contributes.configuration.title` 使用字面量 `Editor Console Toolkit`, 不进 nls, 以维持 key 集恰好 6 个.

### 5.3 Prefix 配置

```json
"editorConsoleToolkit.prefix": {
  "type": "string",
  "default": "🎯🎯🎯 [DEBUG]",
  "maxLength": 80,
  "scope": "language-overridable",
  "description": "%config.prefix%"
}
```

- `scope` 必须是 `language-overridable`: 只有该作用域的设置才允许 `"[python]": { "editorConsoleToolkit.prefix": "..." }` 形式的语言级覆盖. `resource` 作用域做不到.
- 每次命令执行时读取 `vscode.workspace.getConfiguration('editorConsoleToolkit', { uri: document.uri, languageId: document.languageId }).get<string>('prefix', DEFAULT_PREFIX)`. 必须同时传 `uri` 和 `languageId`, 否则语言级覆盖不生效. 不缓存, 不注册 `onDidChangeConfiguration`, 因此改设置立即生效, 无需 Reload Window.
- 运行时不校验不报错: 读到值后剥离 `\r`, `\n` 与 C0/C1 控制字符, 其余原样保留(含可见空格). 空串合法, 表示不加前缀. `maxLength` 只作为 Settings UI 提示, 运行时不截断不拒绝.
- 各适配器负责把清洗后的 prefix 转义进本语言的字符串字面量.

## 6. 语言支持策略

### 6.1 Tier 1: 已实现的 12 个适配器 / 15 个 languageId

可见文本统一记为 `TEXT`, 其值为 `<清洗后的 prefix><空格><label>:`, 例如 `🎯🎯🎯 [DEBUG] user:`. 空 prefix 时退化为 `user:`(不留前导空格). `EXPR` 为原始表达式代码.

| adapter id | languageIds | 注释符 | 引号 | 渲染模板 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `javascript` | `javascript`, `javascriptreact`, `typescript`, `typescriptreact` | `//` | `'` | `console.log('TEXT', EXPR);` | 定界符含反引号, 覆盖跨行模板字符串 |
| `python` | `python` | `#` | `'` | `print('TEXT', EXPR)` | |
| `java` | `java` | `//` | `"` | `System.out.println("TEXT " + String.valueOf(EXPR));` | 全限定名, 不增加 import |
| `kotlin` | `kotlin` | `//` | `"` | `println("TEXT ${EXPR}")` | 需转义 `$` |
| `csharp` | `csharp` | `//` | `"` | `System.Console.WriteLine("TEXT {0}", EXPR);` | `{` `}` 双写转义, 不依赖 `using System` |
| `lua` | `lua` | `--` | `"` | `print("TEXT", EXPR)` | |
| `ruby` | `ruby` | `#` | `"` | `puts "TEXT #{(EXPR).inspect}"` | 需转义 `#` |
| `php` | `php` | `//` | `'` | `var_dump('TEXT', EXPR);` | `$` 并入标识符字符集 |
| `swift` | `swift` | `//` | `"` | `print("TEXT", EXPR)` | 定界符只有 `"` |
| `dart` | `dart` | `//` | `'` | `print('TEXT ${EXPR}');` | 需转义 `$` |
| `rust` | `rust` | `//` | `"` | `println!("TEXT {:?}", EXPR);` | `{` `}` 双写; 定界符只有 `"`; 目标值须实现 `Debug` |
| `elixir` | `elixir` | `#` | `"` | `IO.inspect(EXPR, label: "TEXT")` | 用不带冒号的 `bareText` |

不把 JSON, YAML, Markdown, HTML, CSS 等非运行时代码文件视为可记录语言. JSX/TSX 只支持普通语句行.

### 6.2 Tier 2: 后续阶段

- `shellscript`, `powershell`, `perl`: 需要独立的"安全变量表达式"判定(只接受裸标识符, `$name`, `${name}`, 简单属性链或标量), 与通用词法扫描器不同, 因此推迟.
- Go: `fmt.Printf("... %+v\n", user)`, 需识别已有 `fmt` import 与别名, 并在 import block 中安全插入.
- C++ / C: 需要 include 管理与格式说明符推断.
- Scala, Groovy, Clojure, R: 语句简单, 按使用优先级补充.
- Vue, Svelte, Astro: 先识别 `<script>` 区域语言, 再复用 `javascript` 适配器.
- Jupyter Notebook: 按 cell languageId 路由.

### 6.3 Tier 3: 方言和上下文驱动

- SQL 无统一过程式日志语义: PL/pgSQL 用 `RAISE NOTICE`, T-SQL 用 `PRINT`, MySQL 用调试 `SELECT`, SQLite 无对应物. 必须新增显式 `sqlDialect` 配置, 未选择方言时不插入, 不提供通用 fallback.
- Objective-C, CUDA, 模板语言和 DSL 单独设计, 不落入通用适配器兜底.
- 复杂语言按需引入 Tree-sitter 或专用解析器, 解析器隔离在各自适配器内, 不进入公共链路.

## 7. 核心架构和数据契约

### 7.1 `src/core/types.ts`

```ts
export type OffsetRange = { start: number; end: number };

export type EndOfLine = '\n' | '\r\n';

export type LineInfo = {
  index: number;
  start: number;      // 行首 offset
  end: number;        // 行尾 offset, 不含 \r 与 \n
  text: string;       // 不含换行符
};

export type DocumentSnapshot = {
  readonly text: string;
  readonly languageId: string;
  readonly eol: EndOfLine;
  readonly lineCount: number;
  lineAt(index: number): LineInfo;
  lineOf(offset: number): number;
};

export type SelectionLike = { anchor: number; active: number };   // offset, 允许反向

export type UnsupportedCode =
  | 'no-active-editor'
  | 'unsupported-language'
  | 'multiline-selection'
  | 'unbalanced-syntax'
  | 'cursor-in-comment'
  | 'cursor-in-string'
  | 'empty-target'
  | 'no-managed-logs';

export type Unsupported = { kind: 'unsupported'; code: UnsupportedCode };

export type ExpressionTarget = {
  kind: 'target';
  expression: string;     // 保留原始代码语法
  label: string;          // 折叠连续空白后的展示文本
  sourceRange: OffsetRange;
  sourceLine: number;
};

export type InsertionAnchor = {
  kind: 'anchor';
  line: number;           // 逻辑语句的最后一行
  offset: number;         // 该行行尾 offset
  indent: string;         // 目标行的前导空白
};

export type RenderLogInput = { prefix: string; label: string; expression: string };

export type RenderedLog = { body: string };   // 不含缩进, 不含换行, 不含 marker

export type PlannedEdit =
  | { kind: 'insert'; offset: number; text: string }
  | { kind: 'delete'; range: OffsetRange };

export type EditPlan = { edits: PlannedEdit[]; firstReason: UnsupportedCode | null };
```

所有联合类型都带 `kind` 判别字段. `Unsupported` 是普通对象, 由 `unsupported(code)` 工厂函数构造, 不是类, 不抛异常 —— 失败沿返回值传播, 不用异常做控制流.

`src/core/snapshot.ts` 的 `createSnapshot(text, languageId, eol)` 接收纯文本而非 `TextDocument`, 这是 core 层不依赖 `vscode` 的前提. 行切分按实际字符进行, 与 `eol` 参数无关 —— 文档可能混用 LF 与 CRLF, `eol` 只决定新插入行使用的换行符.

### 7.2 `LanguageAdapter` 与模板适配器

`src/languages/languageAdapter.ts`:

```ts
export interface LanguageAdapter {
  readonly id: string;
  readonly languageIds: readonly string[];
  readonly commentPrefix: string;              // '//' | '#' | '--'
  resolveTarget(s: DocumentSnapshot, sel: SelectionLike): ExpressionTarget | Unsupported;
  locateInsertion(s: DocumentSnapshot, t: ExpressionTarget): InsertionAnchor | Unsupported;
  renderLog(input: RenderLogInput): RenderedLog;
  markerPattern(): RegExp;
}
```

`src/languages/templateAdapter.ts` 导出 `createTemplateAdapter(spec): LanguageAdapter`. 12 个适配器全部由它生成, `resolveTarget` / `locateInsertion` / `markerPattern` 共用通用实现, 语言只声明差异:

```ts
export type TemplateSpec = {
  readonly id: string;
  readonly languageIds: readonly string[];
  readonly commentPrefix: string;
  readonly quote: '"' | "'";
  readonly identifierExtra?: string;              // 追加到标识符字符集, 如 PHP 的 '$'
  readonly stringDelimiters?: readonly string[];  // 默认 ['"', "'"]
  readonly escapeText?: (raw: string, quote: string) => string;
  readonly render: (ctx: RenderContext) => string;
};

export type RenderContext = {
  text: string;      // 已转义的可见文本, 形如 `🎯🎯🎯 [DEBUG] user:`
  bareText: string;  // 同上但不带结尾冒号, 供 label 型 API 使用
  expr: string;      // 原始表达式代码
  q: string;         // 本语言的引号
};
```

`stringDelimiters` 是必要的逃生口: Rust 的生命周期 `&'a str` 与字符字面量会让单引号扫描失准, 因此 Rust 与 Swift 只保留 `"`; JavaScript 追加反引号以覆盖跨行模板字符串.

`src/languages/escape.ts` 导出两个纯函数:

- `escapeLiteral(raw, quote, extra?)` —— 单次遍历, 对 `\`, 引号以及 `extra` 中的字符加反斜杠前缀. 用 `for...of` 按码点遍历, 因此 emoji 等 UTF-16 代理对不会被拆断.
- `doubleBraces(raw)` —— C# 与 Rust 的格式串里 `{` `}` 用双写而非反斜杠转义.

两者互不影响, 组合顺序无关.

`src/languages/registry.ts` 在模块加载时构建一次不可变 `Map<languageId, LanguageAdapter>`, 同一 languageId 重复注册在构建期抛错. 未命中时命令层报 `unsupported-language`.

### 7.3 所有权标记

每条生成的日志行尾追加:

```text
<空格><注释符><空格>ect:v1
```

示例:

```ts
console.log('🎯🎯🎯 [DEBUG] user:', user); // ect:v1
```

```py
print('🎯🎯🎯 [DEBUG] user:', user) # ect:v1
```

```lua
print("🎯🎯🎯 [DEBUG] user:", user) -- ect:v1
```

规则:

- `markerPattern()` = `new RegExp('\\s' + escapeRegExp(commentPrefix) + '\\s*ect:v1\\s*$')`.
- 判定"某行是本扩展日志行"的唯一条件: 该行被 `markerPattern()` 命中.
- Marker **不含 prefix**, 因此改前缀后仍能移除此前插入的日志.
- Marker **不含适配器 id 与哈希**. 定位精度由"日志必须位于目标锚点的紧邻下一行"这一位置约束提供, 位置约束已经足够, 再加哈希只是冗余噪音.
- 没有 marker 的用户日志绝不删除.
- 标记位于行尾, 因此把日志整行注释掉之后标记依然有效, 这是 Toggle All 能双向工作的基础.
- `v1` 是 schema 版本, 后续协议升级时保留旧版本解析能力.

### 7.4 命令语义

`src/core/planEdits.ts` 是唯一的决策点, 输出纯 `EditPlan`, 不接触编辑器.

模式分两类:

```ts
export type SelectionMode = 'insert' | 'toggle';        // 逐 selection 工作
export type CommandMode = SelectionMode | 'toggle-all'; // toggle-all 作用于整个文件
```

**Toggle**(每个 selection 至多一条编辑):

1. 若光标所在行本身被 `markerPattern()` 命中, 产出 `delete`(整行含行尾换行), 结束.
2. 否则 `resolveTarget` → `locateInsertion`, 任一步返回 `Unsupported` 则记录原因并跳过该 selection.
3. 若锚点的紧邻下一行被 `markerPattern()` 命中, 产出 `delete`(该行含行尾换行).
4. 否则产出 `insert`.

**Insert**:

1. `resolveTarget` → `locateInsertion`, 失败则记录原因并跳过.
2. 若锚点紧邻下一行被 `markerPattern()` 命中, **且**该行去掉缩进与 marker 后与本次将渲染的 `body` 完全相同, 则跳过, 避免重复插入.
3. 否则产出 `insert`.

**Toggle All**(`planToggleAllLogs`, 不看 selection 也不读 prefix):

1. 扫描全文, 收集被 `markerPattern()` 命中的行.
2. 一条都没有 → 空计划 + `no-managed-logs`.
3. 只要还有未注释的, 就给每条未注释的在**缩进之后**插入 `<注释符><空格>`; 已注释的不动. 混合状态因此一次收敛为全部注释.
4. 全部已注释 → 逐条删除缩进之后的注释符与至多一个紧随空格.

注释符插在缩进之后而非行首, 所以缩进保持不变, 行尾 marker 不受影响, 被注释的日志之后仍能被单条 Toggle 与本命令识别. 该命令复用既有的 `insert` / `delete` 两种 `PlannedEdit`, 没有引入新的编辑类型.

去重与冲突:

- 多个 selection 解析到同一 `anchor.offset` 时只保留第一条.
- 多个 `delete` 的 range 重叠时只保留第一条; 不执行部分重叠删除.
- `insert` 文本 = `eol + indent + body + ' ' + commentPrefix + ' ect:v1'`. 锚点行是文件最后一行且末尾无换行时, 该拼接自然补上一个换行.
- 全部编辑在一次 `TextEditor.edit(builder => ...)` 中提交, 形成单个 undo step. `TextEditorEdit` 的所有位置都基于原文档坐标, 因此**不需要按 offset 倒序排序**.
- 全部计算基于内存快照, 不使用 `fs`, 未保存文件同样正确.

反馈:

- 一条编辑都没产出时显示一条 warning, 取第一个 `UnsupportedCode` 对应的文案.
- 部分成功时静默.
- 不保存文档, 不触发格式化, 不修改无关行.

### 7.5 目标解析与插入点扫描

`src/core/selectionResolver.ts`:

- 显式非空选择: 跨行返回 `multiline-selection`; 单行则表达式取选中文本两端 trim 的结果, 为空返回 `empty-target`.
- 空选择: 以光标为中心, 按 `[A-Za-z0-9_]` 加 `identifierExtra` 向两侧扩展, 再**向左**吸收连续的 `.ident` 属性链. 只向左吸收, 因此光标停在 `user.profile.name` 的 `user` 上得到 `user`, 停在 `name` 上得到 `user.profile.name`.
- `label` = `expression.replace(/\s+/g, ' ')`.

`src/core/statementScanner.ts` 逐字符扫描, 维护圆括号 / 方括号 / 花括号深度与字符串状态(支持反斜杠转义), 单行注释按注释符截断:

- 从目标行向下扫描, 直到某行结束时深度归零, 不在字符串中, 且未以反斜杠续行, 该行即锚点行.
- 字符串状态跨行保留, 因此 JS 模板字符串与 Python 三引号可以正确跨行; 真正未闭合的字符串由行数上限兜住.
- 连续扫描超过 50 行仍未归零, 返回 `unbalanced-syntax`.
- 光标落在单行注释区间内, 返回 `cursor-in-comment`.
- 光标落在字符串字面量内, 返回 `cursor-in-string`.

拒绝策略采用宽松档: **只拒绝上述 4 类明显不安全的情况**, 其余一律在锚点行之后插入. 不做"证明不在 JSX 标签 / 参数列表 / import 声明内部"的额外判定 —— 误插可由一次撤销回退, 频繁拒绝的干扰更大.

### 7.6 运行时本地化文案

`vscode.l10n.t(...)` 的英文源串即 lookup key, 因此调用点必须写字面量而不能拼接. 简体中文写入 `l10n/bundle.l10n.zh-cn.json`. 集合固定为 8 条, 与 `UnsupportedCode` 一一对应:

| UnsupportedCode | English(源串) | 简体中文 |
| --- | --- | --- |
| `no-active-editor` | `No active editor.` | `没有活动编辑器.` |
| `unsupported-language` | `Console Toolkit does not support this language yet.` | `Console Toolkit 尚未支持该语言.` |
| `multiline-selection` | `Select a single-line expression.` | `请选择单行表达式.` |
| `unbalanced-syntax` | `Cannot find a safe place to insert the log.` | `找不到安全的日志插入位置.` |
| `cursor-in-comment` | `Place the cursor on an expression, not inside a comment.` | `请把光标放在表达式上, 而不是注释内.` |
| `cursor-in-string` | `Place the cursor on an expression, not inside a string.` | `请把光标放在表达式上, 而不是字符串内.` |
| `empty-target` | `Nothing to log at the cursor.` | `光标处没有可记录的表达式.` |
| `no-managed-logs` | `No Console Toolkit logs in this file.` | `此文件中没有 Console Toolkit 生成的日志.` |

## 8. 激活和运行链路

`src/extension.ts` 只注册三条命令并放入 `context.subscriptions`. 没有监听器, 计时器, 状态项或后台任务, 因此不导出有实际工作的 `deactivate`.

```text
Command Palette / 用户自绑快捷键
  -> VS Code 按 contributes.commands 自动激活扩展
  -> 读取活动编辑器; toggle-all 之外的模式再读 prefix(uri + languageId)与 selections
  -> languageId 路由适配器
  -> snapshot 生成编辑计划
  -> 单次 TextEditor.edit
  -> 需要时显示一条 warning
```

## 9. 实施步骤

- [x] 工程基线: `build.mjs`, `tsconfig.json`, `.gitignore`, `.vscodeignore`, `.vscode/launch.json`, `.vscode/tasks.json`.
- [x] 扩展身份与发布文件: `package.json`, `LICENSE.txt`, `CHANGELOG.md`, README, 两个 `package.nls*.json`, `l10n/bundle.l10n.zh-cn.json`, `scripts/render-icon.mjs` 与 `media/icon.svg`.
- [x] 清单契约: 命令, insert 的单条默认 `keybindings` 与 `editorConsoleToolkit.prefix` 配置; 不声明 `activationEvents`, `views`, `viewsContainers`, `menus`, `extensionDependencies`.
- [x] `src/core/types.ts` 与 `src/core/snapshot.ts`: 不可变 `DocumentSnapshot` 与行索引.
- [x] `src/core/selectionResolver.ts`: 显式单行选择, 反向选择, 空选择的标识符与属性链扩展.
- [x] `src/core/statementScanner.ts`: 括号深度与字符串状态扫描, 50 行上限, 注释/字符串内光标判定, 锚点与缩进.
- [x] `src/core/logMarker.ts`: marker 构造, 匹配与剥离.
- [x] `languageAdapter.ts`, `escape.ts`, `templateAdapter.ts`, `registry.ts`.
- [x] §6.1 的 12 个适配器.
- [x] `src/core/planEdits.ts`: Insert / Toggle / Toggle All 三种计划.
- [x] `src/commands/**` 与 `src/extension.ts`.
- [x] README 与 CHANGELOG.
- [x] 交付验证与打包.

## 10. 验证方式

首版不建设自动化测试. 质量门由类型检查, 静态负向检查和人工验收组成.

### 10.1 可执行命令

```bash
npm run typecheck
npm run compile
npm run package
npx vsce ls
```

### 10.2 静态负向检查

对 `src/` 与 `out/extension.js` 检查不得出现:

```text
createStatusBarItem
createTreeView
registerTreeDataProvider
registerWebviewViewProvider
onDidChangeTextDocument
onDidChangeActiveTextEditor
onDidChangeConfiguration
setInterval
setTimeout
require('fs')
readFileSync
axios
fetch(
telemetry
vscode.git
```

对 `package.json` 检查不存在:

```text
contributes.views
contributes.viewsContainers
contributes.menus
contributes.commands[].enablement
activationEvents
extensionDependencies
dependencies(非空)
```

一致性检查:

- 两个 `package.nls*.json` 的 key 集完全一致, 且与 `package.json` 中实际使用的 `%...%` 占位符一一对应, 无未使用 key.
- `src/commands/runner.ts` 中全部 `vscode.l10n.t('...')` 源串与 `l10n/bundle.l10n.zh-cn.json` 的 key 一一对应, 无缺失无多余.

### 10.3 人工验收清单

安装 VSIX 后逐项确认:

- 新开窗口后没有新增活动栏, 侧边栏, 状态栏内容.
- 未执行命令前, Extensions 面板中扩展显示为未激活.
- Command Palette 搜索 `Console Toolkit` 恰好显示三条命令.
- Keyboard Shortcuts 中三条命令可被查找并自行绑定, 且没有默认按键.
- 显示语言为简体中文时, 扩展描述, 分类, 命令名, 配置描述和 warning 全部为中文; 英文 UI 显示英文.
- 修改 workspace 级或 `"[python]"` 语言级 prefix 后, 无需 Reload Window 立即生效.
- 对 JS, TS, TSX, Python, Java, Kotlin, C#, Lua, Ruby, PHP, Swift, Dart, Rust, Elixir 各取一个变量, 完成 insert → toggle 移除的往返.
- 未保存文档中 insert 后立即 toggle 可移除.
- Prefix 改为其他值后, 仍能移除此前插入的日志.
- 手写的无 marker `console.log` 不会被 toggle 删除.
- 多光标选中同一变量的多个出现处, 各自插入且互不串行; 一次撤销恢复命令前状态.
- Toggle All 往返一次后文件与执行前逐字符相同; 混合状态一次收敛为全部注释; 文件无本扩展日志时提示且不修改文档.
- CRLF 文件与文件末尾无换行的情况下插入位置正确.
- 光标停在注释内, 字符串内, 或跨行选择时, 文档不被修改且只弹一条对应 warning.

## 11. 发布流程

`.github/workflows/release.yml`. 推送 `v*` 标签即触发; 也可用 `workflow_dispatch` 手动补发某个已存在的版本而不重新打标签.

三个 job:

| job | 触发条件 | 职责 |
| --- | --- | --- |
| `release` | 总是 | 校验 → 打包 vsix → 创建 GitHub Release 并附带 vsix → 上传 artifact |
| `marketplace` | 仓库配置了 `VSCE_PAT` | 发布到 VS Code Marketplace |
| `open-vsx` | 仓库配置了 `OVSX_PAT` | 发布到 Open VSX(VSCodium / Cursor / Windsurf 等发行版的市场) |

`release` job 的校验链, 任一步失败即中止发布:

1. **版本一致性** —— 标签名去掉 `v` 前缀后必须与 `package.json` 的 `version` 相等, 否则产物名与 Release 名会错位.
2. **`npm run typecheck`** —— 本项目没有自动化测试, 类型检查是唯一的自动质量门, 因此必须在打包前独立跑一次.
3. **本地化一致性** —— 两个 `package.nls*.json` 的 key 集必须相同, 且与清单里用到的 `%...%` 占位符一一对应; `runner.ts` 中的 `vscode.l10n.t` 源串必须与中文 bundle 的 key 一一对应. 这两项漏了不会让构建失败, 只会在市场上静默丢文案, 所以必须在 CI 拦住.
4. **静态负向检查** —— `src/` 不得出现常驻 UI, 后台监听, 定时器, 磁盘读取, 网络与遥测 API; `package.json` 不得出现 `views` / `viewsContainers` / `menus` / `activationEvents` / `extensionDependencies` / 非空 `dependencies` / `commands[].enablement`. 最后一项专门防止 §5.2 那个坑再次出现. 同时正向断言 `contributes.keybindings` 与 §5.2 一致: 有且只有 insert 的 `alt+l` 一条, `when` 与命令名都对得上.
5. **打包** —— `vsce package` 会触发 `vscode:prepublish` 做生产构建, 无需另外 compile.
6. **Release 说明** —— 从 `CHANGELOG.md` 中抽取 `## <version>` 小节作为 Release body; 缺失时只告警, 不阻断发布.

两个市场 job 都用 `--packagePath` 发布 `release` job 已经校验并附到 Release 的那个 vsix, **不重新构建**, 保证市场上的产物与 Release 附件逐字节一致.

`secrets` 上下文在 job 级 `if` 中不可用, 因此 `release` job 末尾把两个 PAT 是否存在转成 job output 供下游判断. 未配置 PAT 时对应 job 直接跳过, 只发 GitHub Release, 不会失败.

发布一个版本的完整步骤:

```bash
# 1. 更新 package.json 的 version 与 CHANGELOG.md 的 ## <version> 小节
# 2. 提交
git commit -am "chore: release v0.0.2"
# 3. 打标签并推送
git tag v0.0.2 && git push origin main --tags
```

首次发布前需要在仓库 Settings → Secrets and variables → Actions 配置:

- `VSCE_PAT` —— Azure DevOps 的 Personal Access Token, 作用域 Marketplace (Publish). 不配则跳过官方市场.
- `OVSX_PAT` —— Open VSX 的访问令牌. 不配则跳过.

## 12. 风险与处理

- **无自动化测试**: 回归完全依赖人工验收清单. 每次改动语言适配器或扫描器后必须重跑 §10.3 中相关条目. 这是为换取交付速度而明确接受的取舍, 也是首个应当补上的技术债.
- 轻量词法扫描不覆盖所有语法: 宽松拒绝档意味着少数场景可能插到次优位置, 由撤销回退; 不以错误代码换取虚假的支持数量.
- Marker 出现在源码中: 这是改前缀后仍可精确移除的必要信息, 已压缩到 `// ect:v1` 共 10 个字符.
- Rust 需要 `Debug`, Kotlin/Dart 插值对复杂表达式可能不合法: README 写明限制, 模板保持保守.
- 插入日志可能触发项目 lint: 扩展不自动添加 `eslint-disable`, 不修改项目配置.
- `shellscript` / `powershell` / `perl` 推迟到 Tier 2: 首版对这些语言返回 `unsupported-language`, README 已说明.
- Go / C / C++ 的 import 与 include 编辑可能与格式化器冲突: 放在 Tier 2 单独设计.
- SQL 无统一日志语义: 必须按方言显式选择, 不提供通用 fallback.

## 13. 已确认决策

- **不做任何自动化测试**(单元, 集成, 性能), 保留 `tsc --noEmit` 作为唯一自动质量门, 功能验证由人工安装使用完成.
- **首版语言范围为 12 个适配器 / 15 个 languageId**; `shellscript`, `powershell`, `perl` 与 Go 在 Tier 2, SQL 在 Tier 3.
- **Marker 采用极简形态 `<注释符> ect:v1`**, 不含适配器 id 与哈希; 定位精度由"必须位于锚点紧邻下一行"提供.
- **拒绝策略采用宽松档**, 只拒绝 §7.5 列出的 4 类明显不安全情况, 其余尽量插入.
- **Toggle All 的语义是注释/取消注释而非删除**, 不删除任何行, 因此随时可以恢复.
- **命令一律不加 `enablement`**, 原因见 §5.2.
- 默认 prefix 为 `🎯🎯🎯 [DEBUG]`, 空串合法, 控制字符静默剥离而不报错.
- `prefix` 作用域为 `language-overridable`, 读取时同时传 `uri` 与 `languageId`.
- 多光标是必须验收的功能.
- 扩展只操作自己带 marker 的日志, 不清理用户手写日志.

## 14. 实现记录

### 14.1 与原设计的偏差

- **新增 `src/commands/runner.ts`**: 三条命令只有模式参数之差, 把读取编辑器, 读配置, 建快照, 提交编辑与 warning 分发的共享流程集中在此, 三个 command 文件各自只剩一行转发.
- **`createSnapshot` 接收纯文本而非 `TextDocument`**: 使 `core/` 全部模块不依赖 `vscode`, 转换放在 `runner.ts`.
- **`TemplateSpec` 增加 `stringDelimiters`**: Rust 生命周期 `&'a str` 与字符字面量会让单引号扫描失准, 因此 Rust 与 Swift 只保留 `"`, JS 追加反引号覆盖跨行模板字符串.
- **`statementScanner.ts` 处理反斜杠续行**: 用于 Python 等以 `\` 换行的语句, 属于安全方向的补充.
- **移除命令的 `enablement`**: 初版曾声明 `"enablement": "editorTextFocus"`, 导致三条命令在 Command Palette 中完全不显示. 原因分析见 §5.2. 这是一条容易反复踩的坑, 已写进契约.
- **默认 prefix 从中性方括号改为 `🎯🎯🎯 [DEBUG]`**: 更醒目也更易 grep. 已核对 emoji 的 UTF-16 代理对不会被 `escapeLiteral` 的按码点遍历拆断, 12 个适配器输出均正确.
- **Toggle All 为交付后追加的第三条命令**: 语义定为注释/取消注释, 复用既有编辑类型, 未引入新的 `PlannedEdit` 变体.

### 14.2 验证结果

- `npm run typecheck` 通过.
- `npm run compile` 通过.
- `npm run package` 通过, 生产构建 `out/extension.js` 约 9.9 KB, VSIX 约 19.9 KB.
- `npx vsce ls` 输出恰为 10 个文件: `package.json`, 两个 `package.nls*.json`, `README.md`, `LICENSE.txt`, `CHANGELOG.md`, `out/extension.js`, `media/icon.svg`, `media/icon.png`, `l10n/bundle.l10n.zh-cn.json`. 不含 `src/`, `docs/`, sourcemap.
- §10.2 静态负向检查全部无命中; `package.json` 的 `contributes` 只有 `commands` 与 `configuration`, `dependencies` 为空.
- NLS 校验: 6 个 key 双语对称且与清单占位符一一对应; 8 条运行时 l10n 源串与 bundle 一一对应, 无缺失无多余.

### 14.3 冒烟核对

按 §3.2 不建设常驻自动化测试, 但交付前用一次性脚本直接驱动 `planEdits` 做过两轮核对, 核对后脚本已删除.

第一轮 39 项, 全部通过: 12 个适配器的渲染形态, Toggle 往返, 在日志行上 Toggle, 改 prefix 后移除, 无 marker 的用户日志不删, Insert 不重复插入, 多行调用的锚点与缩进, 属性链向左吸收, 多光标同目标只编辑一次, 多光标双目标不串位, CRLF, 文件末尾无换行, 末行日志移除, 5 类拒绝路径, 4 种前缀转义(引号 / 花括号 / `$` / `#`), 空前缀, Rust 生命周期不被当成字符串, `// ect` 不被误判为 marker.

第二轮 11 项, 全部通过: 全部注释, 全部恢复, 往返幂等, 混合收敛, 只动带 marker 的行, 无日志时报原因, Lua 与 Python 注释符, tab 缩进, 无空格注释的恢复.

### 14.4 未验证项

以下只能在真实 Extension Host 中确认, 属于 §10.3 人工验收:

- 扩展按命令激活, 未执行命令前不激活.
- Command Palette 与 Keyboard Shortcuts 的实际显示与无默认按键.
- 简体中文 UI 下清单文案与运行时 warning 的显示.
- 语言级 prefix 覆盖在真实设置中即时生效.
- 一次撤销恢复多光标编辑前状态.
- 未保存文档 insert 后立即 toggle.

## 15. 后续任务

- 补自动化测试, 优先覆盖 `planEdits` 与 `statementScanner` 两个纯逻辑模块; 补上后在 §11 的 `release` job 里增加一个 `npm test` 步骤.
- 按 §6.2 推进 Tier 2 语言.
- 配置 `VSCE_PAT` 与 `OVSX_PAT` 两个 repository secret, 然后打第一个 `v0.0.1` 标签走一遍 §11 的发布流程.
