import type { DocumentSnapshot } from "./types";

/**
 * 词法状态层.
 *
 * 这一层只回答"文档的每一行开始时, 我们处在什么词法状态里": 哪些定界符还没闭合, 是否卡在
 * 一个跨行字符串或块注释中间. 锚点策略不在这里, 见 statementScanner.ts.
 *
 * 为什么要有它: 只看目标行本身无法回答"我现在是不是在某个多行调用的参数列表里", 而这正是
 * 把日志插进括号内部的根因. 状态表按整份文档算一次, 多光标共用同一张表.
 */

/**
 * 未闭合定界符的种类.
 *
 * 花括号必须区分块与字面量: 块不需要在语句结束前闭合(日志可以落在块内), 而对象字面量必须
 * 闭合(否则日志会插到字面量中间, 产生语法错误).
 */
export type DelimiterKind = "paren" | "bracket" | "brace-block" | "brace-literal";

export type OpenDelimiter = { kind: DelimiterKind; line: number; column: number };

export type LexState = {
	stack: readonly OpenDelimiter[];
	/** 未闭合的字符串定界符, 否则 null. */
	openQuote: string | null;
	inBlockComment: boolean;
};

export type LexConfig = {
	lineComment: string;
	/** 字符串定界符; 可以是多字符, 例如 Python 的 `'''`. */
	stringDelimiters: readonly string[];
	blockComment?: { open: string; close: string };
	/** 语言有正则字面量时开启: `/.../` 与除法区分开, 否则正则里的引号会污染后续整个文档. */
	regexLiterals?: boolean;
};

type DelimiterSpan = {
	start: number;
	end: number | null;
	kind: DelimiterKind;
	parent: DelimiterSpan | null;
};

/** 与行状态共用生命周期, 不为每个光标重复扫描全文. */
const scanDetails = new WeakMap<
	readonly LexState[],
	{ spans: DelimiterSpan[]; regexEntries: boolean[] }
>();

/** 行尾出现这些符号时, 紧随的 `{` 是块: 头部的收尾括号, 箭头函数体, do 块. */
const BLOCK_TAIL_SYMBOLS = [")", "=>", "->"] as const;

/** 行尾是这些词时, 紧随的 `{` 是块. */
const BLOCK_TAIL_WORDS = ["else", "do", "try", "finally", "catch", "then"] as const;

/** 行尾出现这些符号时, 紧随的 `{` 是对象字面量: 赋值, 实参, 数组元素, 键值对, 运算符右侧. */
const LITERAL_TAIL_SYMBOLS = [
	"==",
	"=>",
	"=",
	"(",
	",",
	":",
	"[",
	"{",
	"&&",
	"||",
	"??",
	"?",
	"+",
] as const;

/** 行尾是这些词时, 紧随的 `{` 是字面量. */
const LITERAL_TAIL_WORDS = ["return", "yield", "in", "of", "typeof", "new", "await"] as const;

/** 行尾是这些符号时, 语句在下一行继续. `:` 刻意不在其中 —— Python 的 `:` 是块开始. */
const TRAILING_CONTINUATIONS = [
	"\\",
	"&&",
	"||",
	"??",
	"=>",
	"->",
	"==",
	"=",
	"+",
	"-",
	"*",
	"/",
	"%",
	"|",
	"&",
	"^",
	",",
	"?",
	".",
] as const;

/**
 * 行首是这些符号时, 它是上一行的延续.
 *
 * 三元与方法链靠这一条, 因为上一行尾没有任何符号可查. `{` 也在其中, 为的是 Allman 风格:
 * `if (x)` 与它下一行的 `{` 必须算同一条语句, 否则日志会插在两者之间, 变成 if 的唯一分支体.
 */
const LEADING_CONTINUATIONS = [
	"&&",
	"||",
	"??",
	"=>",
	"->",
	"?",
	":",
	".",
	"+",
	"*",
	"/",
	"%",
	"|",
	"&",
	"^",
	",",
	"{",
] as const;

const WORD_TAIL = /([A-Za-z_$][\w$]*)$/;

/**
 * 这些关键字之后, 紧随的 `/` 开启正则字面量而不是除法.
 *
 * 它们与 `/` 之间不要求操作数 (`return /re/`, `case /x/:`), 而普通标识符之后的 `/` 一律是除法.
 */
const REGEX_KEYWORDS = new Set([
	"return",
	"typeof",
	"instanceof",
	"in",
	"of",
	"new",
	"case",
	"do",
	"else",
	"void",
	"delete",
	"throw",
	"yield",
	"await",
]);

/** 正则字面量允许的 flags 字符. */
const REGEX_FLAGS = /[a-z]/;

type TokenState = { regexAllowed: boolean };

/**
 * 推进一个代码 token, 记录后面能否开始正则. 字符串与正则由调用方整体跳过, 收尾后作为操作数.
 * `++`/`--` 在操作数后是后缀, 在表达式开头是前缀, 两者都保留原来的期待状态.
 * `}` 仍按操作数处理, 不推断块后紧跟正则的语法歧义.
 */
function advanceToken(text: string, start: number, state: TokenState): number {
	const ch = text[start];
	if (/\s/.test(ch)) return start + 1;
	if (/[\w$]/.test(ch)) {
		let end = start + 1;
		while (end < text.length && /[\w$]/.test(text[end])) end++;
		state.regexAllowed = REGEX_KEYWORDS.has(text.slice(start, end));
		return end;
	}
	if ((ch === "+" || ch === "-") && text[start + 1] === ch) return start + 2;
	state.regexAllowed = !")]}".includes(ch);
	return start + 1;
}

/**
 * 从正则开始位置越过整个字面量, 返回结束后的下标.
 *
 * 处理转义与 `[...]` 字符类 (类内的 `/` 不收尾); 收尾后吞掉 flags. 跨行的正则不存在
 * (JS 语法不允许), 没找到收尾就把整行余下部分当作正则内容.
 */
function skipRegex(text: string, start: number): number {
	let i = start + 1;
	let inClass = false;
	while (i < text.length) {
		const ch = text[i];
		if (ch === "\\") {
			i += 2;
			continue;
		}
		if (inClass) {
			if (ch === "]") inClass = false;
		} else if (ch === "[") {
			inClass = true;
		} else if (ch === "/") {
			i += 1;
			while (i < text.length && REGEX_FLAGS.test(text[i])) i++;
			return i;
		}
		i++;
	}
	return text.length;
}

/** 按长度降序匹配, 保证 `=>` 不被 `=` 抢走, `'''` 不被 `'` 抢走. */
const longestFirst = (values: readonly string[]): string[] =>
	[...values].sort((a, b) => b.length - a.length);

/**
 * 判定紧跟在给定代码之后的 `{` 是块还是字面量; 判不出来返回 null.
 *
 * 调用方对 null 一律按字面量处理(即"必须闭合"): 那样日志会落到整条语句之后, 位置偏外但
 * 语法一定合法; 反过来把字面量当成块会直接写出坏代码.
 */
export function classifyBrace(codeBeforeBrace: string): "block" | "literal" | null {
	const code = codeBeforeBrace.replace(/\s+$/, "");
	if (code === "") {
		return null;
	}

	const word = WORD_TAIL.exec(code)?.[1];
	if (word !== undefined) {
		if (BLOCK_TAIL_WORDS.includes(word as (typeof BLOCK_TAIL_WORDS)[number])) return "block";
		if (LITERAL_TAIL_WORDS.includes(word as (typeof LITERAL_TAIL_WORDS)[number]))
			return "literal";
		// 裸标识符收尾: `class A {`, `impl Foo {`, Rust/Go 的 `if x {`. 都是块.
		return "block";
	}

	// 返回类型注解要先于符号表判定: Kotlin/Swift 的 `): Int? {` 以 `?` 收尾, 会被三元的 `?` 抢走.
	if (returnTypeStart(code) !== null || isGenericDeclarationHeader(code)) {
		return "block";
	}

	for (const symbol of longestFirst([...LITERAL_TAIL_SYMBOLS, ...BLOCK_TAIL_SYMBOLS])) {
		if (!code.endsWith(symbol)) continue;
		// `=>` 同时在两张表里, 块的语义优先: `x => {` 是函数体.
		if ((BLOCK_TAIL_SYMBOLS as readonly string[]).includes(symbol)) return "block";
		return "literal";
	}
	return null;
}

const OPENER_OF: Readonly<Record<string, string>> = { ">": "<", "]": "[", "}": "{", ")": "(" };

/** `->` 之前允许出现的修饰词: Swift 的 `throws -> T`, `async throws -> T`. */
const ARROW_RETURN_MODIFIERS = /(\)|\b(?:throws|rethrows|async))\s*$/;

/**
 * 从 `end` 往回跳过一段类型表达式, 返回它的起点; 遇到不属于类型的字符就停在那里.
 *
 * 类型表达式由标识符, 空白, `.` `|` `&` `?` `,` 与成对的 `<>` `[]` `{}` `()` 组成; 成对的
 * 组整体跳过, 因此对象类型 `{ a: number }` 里的 `:` 不会被当成返回类型的冒号. `<...>` 必须
 * 紧贴在标识符之后(`Promise<T>`), 以免把 JSX 的 `: <List>` 也当成类型.
 */
function skipTypeBackward(code: string, end: number): number {
	let i = end;
	while (i > 0) {
		const ch = code[i - 1];
		if (/[\w$\s.|&?,]/.test(ch)) {
			i--;
			continue;
		}
		if (ch === '"' || ch === "'") {
			// 字符串字面量类型 `"a" | "b"`; 不处理转义, 类型里几乎不会出现.
			const open = code.lastIndexOf(ch, i - 2);
			if (open === -1) return i;
			i = open;
			continue;
		}
		const opener = OPENER_OF[ch];
		if (opener === undefined) {
			return i;
		}
		// 往回找配对的开符; `=>` 与 `->` 里的 `>` 不算尖括号.
		let depth = 0;
		let j = i - 1;
		for (; j >= 0; j--) {
			const c = code[j];
			if (c === ">" && (code[j - 1] === "=" || code[j - 1] === "-")) {
				continue;
			}
			if (OPENER_OF[c] !== undefined) {
				depth++;
			} else if (c === "(" || c === "[" || c === "{" || c === "<") {
				depth--;
				if (depth === 0) break;
			}
		}
		if (j < 0 || code[j] !== opener) {
			return i;
		}
		if (opener === "<" && !/[\w$]/.test(code[j - 1] ?? "")) {
			return i;
		}
		i = j;
	}
	return i;
}

/**
 * 函数签名末尾的返回类型注解(`): Promise<T>`, `) -> Vec<T>`)的起点, 即冒号或 `->` 所在位置;
 * 不是返回类型注解时返回 null.
 *
 * 只认紧跟在 `)` 之后的冒号, 因此对象字面量的 `key: value` 与三元的 `: b` 都不会命中.
 */
export function returnTypeStart(code: string): number | null {
	const trimmed = code.replace(/\s+$/, "");
	const start = skipTypeBackward(trimmed, trimmed.length);
	if (start === trimmed.length || trimmed.slice(start).trim() === "") {
		return null;
	}
	const before = trimmed.slice(0, start).replace(/\s+$/, "");
	if (before.endsWith("->")) {
		return ARROW_RETURN_MODIFIERS.test(before.slice(0, -2)) ? before.length - 2 : null;
	}
	if (before.endsWith(":") && !before.endsWith("::")) {
		return /\)\s*$/.test(before.slice(0, -1)) ? before.length - 1 : null;
	}
	return null;
}

/** 以泛型参数收尾的类型声明头: `class A<T>`, `class B extends Base<T>`, `impl<T> Foo<T>`. */
function isGenericDeclarationHeader(code: string): boolean {
	return (
		code.endsWith(">") &&
		/(^|[\s(;{,=])(class|interface|struct|impl|trait|enum|record|extends|implements)\b/.test(
			code
		) &&
		skipTypeBackward(code, code.length) < code.length
	);
}

/**
 * 语句是否在下一行继续.
 *
 * 两个方向都要看: `a &&` 这类把运算符留在行尾的写法看当前行, `cond\n ? a` 与 `foo()\n .bar()`
 * 这类把运算符放在行首的写法只能看下一行 —— 后者的上一行行尾没有任何符号可查.
 */
export function isContinuation(codeOfLine: string, nextLineCode?: string): boolean {
	const code = codeOfLine.replace(/\s+$/, "");
	if (code !== "" && TRAILING_CONTINUATIONS.some(tail => code.endsWith(tail))) {
		return true;
	}
	const next = (nextLineCode ?? "").trim();
	return next !== "" && LEADING_CONTINUATIONS.some(head => next.startsWith(head));
}

/** 去掉行注释之后的代码部分; 只用于启发式判定, 不参与状态推进. */
export function stripLineComment(text: string, config: LexConfig): string {
	const index = text.indexOf(config.lineComment);
	return index === -1 ? text : text.slice(0, index);
}

/**
 * 定界符之前的代码, 以及它实际取自哪一行.
 *
 * `{` 单独占一行时(Allman 风格)必须回看上一行, 否则拿到的是空串, 种类判定只能放弃, 而且
 * `switch` 这类关键字也会查不到. 最多回看三行, 避免在残缺文件里一路上溯.
 */
export function codeBeforeDelimiter(
	snapshot: DocumentSnapshot,
	config: LexConfig,
	line: number,
	column: number
): { line: number; code: string } {
	const head = snapshot.lineAt(line).text.slice(0, column);
	if (head.trim() !== "") {
		return { line, code: head };
	}
	for (let probe = line - 1; probe >= 0 && line - probe <= 3; probe--) {
		const previous = stripLineComment(snapshot.lineAt(probe).text, config);
		if (previous.trim() !== "") {
			return { line: probe, code: previous };
		}
	}
	return { line, code: "" };
}

/**
 * 逐行推进词法状态, 返回每一行的**入口**状态.
 *
 * 返回数组长度为 `lineCount + 1`: 第 `i` 项是第 `i` 行开始时的状态, 末项是文件结束时的状态.
 */
export function scanDocument(snapshot: DocumentSnapshot, config: LexConfig): LexState[] {
	const delimiters = longestFirst(config.stringDelimiters);
	const states: LexState[] = [{ stack: [], openQuote: null, inBlockComment: false }];
	const stack: OpenDelimiter[] = [];
	const spans: DelimiterSpan[] = [];
	const spanStack: DelimiterSpan[] = [];
	const regexEntries = [true];
	let openQuote: string | null = null;
	let inBlockComment = false;
	const token: TokenState = { regexAllowed: true };

	for (let line = 0; line < snapshot.lineCount; line++) {
		const lineInfo = snapshot.lineAt(line);
		const text = lineInfo.text;
		let i = 0;

		while (i < text.length) {
			if (inBlockComment) {
				const close = config.blockComment!.close;
				if (text.startsWith(close, i)) {
					inBlockComment = false;
					i += close.length;
				} else {
					i++;
				}
				continue;
			}

			if (openQuote !== null) {
				if (text[i] === "\\") {
					i += 2;
					continue;
				}
				if (text.startsWith(openQuote, i)) {
					i += openQuote.length;
					token.regexAllowed = false;
					openQuote = null;
					continue;
				}
				i++;
				continue;
			}

			// 块注释开符必须先试: Lua 的行注释 `--` 是块注释 `--[[` 的前缀, 顺序反了就永远进不了块注释.
			if (config.blockComment !== undefined && text.startsWith(config.blockComment.open, i)) {
				inBlockComment = true;
				i += config.blockComment.open.length;
				continue;
			}
			if (text.startsWith(config.lineComment, i)) {
				break;
			}

			const ch = text[i];
			if (ch === "/" && config.regexLiterals === true && token.regexAllowed) {
				i = skipRegex(text, i);
				token.regexAllowed = false;
				continue;
			}

			const delimiter = delimiters.find(candidate => text.startsWith(candidate, i));
			if (delimiter !== undefined) {
				openQuote = delimiter;
				i += delimiter.length;
				continue;
			}

			if (ch === "(" || ch === "[" || ch === "{") {
				let kind: DelimiterKind;
				if (ch === "{") {
					const braceKind = classifyBrace(
						codeBeforeDelimiter(snapshot, config, line, i).code
					);
					kind = braceKind === "block" ? "brace-block" : "brace-literal";
				} else {
					kind = ch === "(" ? "paren" : "bracket";
				}
				stack.push({ kind, line, column: i });
				const span: DelimiterSpan = {
					start: lineInfo.start + i,
					end: null,
					kind,
					parent: spanStack.at(-1) ?? null,
				};
				spans.push(span);
				spanStack.push(span);
			} else if (ch === ")" || ch === "]" || ch === "}") {
				// 多余的闭符直接忽略, 不让栈变成负深度.
				if (stack.length > 0) {
					stack.pop();
					const span = spanStack.pop()!;
					if (
						(ch === ")" && span.kind === "paren") ||
						(ch === "]" && span.kind === "bracket") ||
						(ch === "}" && span.kind.startsWith("brace"))
					) {
						span.end = lineInfo.start + i + 1;
					}
				}
			}
			i = advanceToken(text, i, token);
		}

		states.push({ stack: [...stack], openQuote, inBlockComment });
		regexEntries.push(token.regexAllowed);
	}

	scanDetails.set(states, { spans, regexEntries });
	return states;
}

/**
 * 包含给定 offset 的最内层定界符区间的文档范围; 不在任何定界符内返回 null.
 *
 * 区间为 `[start, end)`, start 是开符位置, end 越过闭符. 用来回答"日志插到收尾行行尾时,
 * 目标还在不在它原本的作用域里": 闭合位置落在插入点之前的作用域 (函数块, 签名括号) 都
 * 会让日志引用不到目标. 用于识别 `function f(value) { return value; }` 这类开闭都压在
 * 一行的写法 —— 那时目标行的入口与出口栈完全一致, 只看栈深发现不了作用域已经关闭.
 */
export function delimiterSpan(
	states: readonly LexState[],
	offset: number
): { start: number; end: number; kind: DelimiterKind } | null {
	const spans = scanDetails.get(states)?.spans ?? [];
	// 开符按 offset 升序记录; 找到最近的开符后, 沿父区间回溯到仍包住目标的最内层配对.
	let low = 0;
	let high = spans.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (spans[mid].start <= offset) low = mid + 1;
		else high = mid;
	}
	let span: DelimiterSpan | null = spans[low - 1] ?? null;
	while (span !== null) {
		if (span.end !== null && offset < span.end - 1) {
			return { start: span.start, end: span.end, kind: span.kind };
		}
		span = span.parent;
	}
	return null;
}

/** 某个 offset 落在代码, 行注释, 块注释还是字符串里; 块注释与跨行字符串都算准. */
export function classifyAt(
	snapshot: DocumentSnapshot,
	offset: number,
	states: readonly LexState[],
	config: LexConfig
): "code" | "comment" | "string" {
	const index = snapshot.lineOf(offset);
	const line = snapshot.lineAt(index);
	const column = Math.max(0, Math.min(offset - line.start, line.text.length));
	const entry = states[index] ?? { stack: [], openQuote: null, inBlockComment: false };

	const delimiters = longestFirst(config.stringDelimiters);
	const text = line.text;
	let openQuote = entry.openQuote;
	let inBlockComment = entry.inBlockComment;
	const token: TokenState = {
		regexAllowed: scanDetails.get(states)?.regexEntries[index] ?? true,
	};
	let i = 0;

	while (i < column) {
		if (inBlockComment) {
			const close = config.blockComment!.close;
			if (text.startsWith(close, i)) {
				inBlockComment = false;
				i += close.length;
			} else {
				i++;
			}
			continue;
		}
		if (openQuote !== null) {
			if (text[i] === "\\") {
				i += 2;
				continue;
			}
			if (text.startsWith(openQuote, i)) {
				i += openQuote.length;
				token.regexAllowed = false;
				openQuote = null;
				continue;
			}
			i++;
			continue;
		}
		if (config.blockComment !== undefined && text.startsWith(config.blockComment.open, i)) {
			inBlockComment = true;
			i += config.blockComment.open.length;
			continue;
		}
		if (text.startsWith(config.lineComment, i)) {
			return "comment";
		}
		const ch = text[i];
		if (ch === "/" && config.regexLiterals === true && token.regexAllowed) {
			// 光标落在正则字面量内部时按代码处理; 字面量越过 column 就直接结束回放。
			const end = skipRegex(text, i);
			if (end > column) return "code";
			i = end;
			token.regexAllowed = false;
			continue;
		}
		const delimiter = delimiters.find(candidate => text.startsWith(candidate, i));
		if (delimiter !== undefined) {
			openQuote = delimiter;
			i += delimiter.length;
			continue;
		}
		i = advanceToken(text, i, token);
	}

	if (inBlockComment) return "comment";
	return openQuote === null ? "code" : "string";
}
