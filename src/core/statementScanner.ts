import {
	classifyAt,
	codeBeforeDelimiter,
	delimiterSpan,
	isContinuation,
	returnTypeStart,
	scanDocument,
	stripLineComment,
} from "./lexer";
import type { LexConfig, LexState, OpenDelimiter } from "./lexer";
import { unsupported } from "./types";
import type { DocumentSnapshot, ExpressionTarget, InsertionAnchor, Unsupported } from "./types";

/** 单条语句允许跨越的最大行数, 防止未闭合语法把扫描拖到文件末尾. */
const MAX_STATEMENT_LINES = 50;

export type ScanConfig = {
	commentPrefix: string;
	/** 本语言的字符串定界符. Rust 只有 `"`, 否则生命周期 `'a` 会被当成字符串开头. */
	stringDelimiters: readonly string[];
	/** 块注释的开闭符; 没有块注释的语言(Python, Ruby, Elixir)不填. */
	blockComment?: { open: string; close: string };
	/** 语言有正则字面量时开启: 词法层把 `/.../` 与除法区分开. */
	regexLiterals?: boolean;
	/**
	 * 语法上不能容纳语句的块的开启关键字, 例如 `switch` 的 case block 与 `class` 的 body.
	 *
	 * 命中时日志插到该语句**之前**一行: `switch` 的判别式与 `extends` 的基类都在进入该语句
	 * 之前就已求值, 所以那个位置的语义是对的; 插进块里则是语法错误.
	 */
	restrictedBlockKeywords?: readonly string[];
	/**
	 * 块的语法形态, 默认花括号.
	 *
	 * `colon-indent` 是 Python: 行尾 `:` 开块, 块体靠缩进. `keyword` 是 Ruby / Lua / Elixir:
	 * 靠 `do` / `then` 或行首关键字开块, 用 `end` 收尾.
	 */
	blockStyle?: "brace" | "colon-indent" | "keyword";
	/** `keyword` 形态下能开块的行首关键字. */
	blockOpenKeywords?: readonly string[];
};

export const toLexConfig = (config: ScanConfig): LexConfig => ({
	lineComment: config.commentPrefix,
	stringDelimiters: config.stringDelimiters,
	blockComment: config.blockComment,
	regexLiterals: config.regexLiterals,
});

/**
 * 词法状态表缓存: 同一份快照与适配器只扫描一次全文档.
 *
 * `planEdits` 会为每个光标调用 `locateAnchor`, 不缓存时每个光标都要重扫全文, 多光标命令的
 * 耗时随光标数与文档长度相乘增长, 且同步阻塞扩展宿主. 快照是一次命令新建的对象, 命令结束
 * 即可回收, 因此按快照弱引用缓存没有泄漏问题.
 */
const scanCache = new WeakMap<DocumentSnapshot, Map<ScanConfig, LexState[]>>();

function statesFor(
	snapshot: DocumentSnapshot,
	config: ScanConfig,
	lexConfig: LexConfig
): LexState[] {
	let perDoc = scanCache.get(snapshot);
	if (perDoc === undefined) {
		perDoc = new Map();
		scanCache.set(snapshot, perDoc);
	}
	let states = perDoc.get(config);
	if (states === undefined) {
		states = scanDocument(snapshot, lexConfig);
		perDoc.set(config, states);
	}
	return states;
}

const leadingWhitespace = (text: string): string => /^[ \t]*/.exec(text)![0];

/** 控制流头的关键字; 这些语句没有块体时, 紧随的行才是分支体, 行尾不能插日志. */
const CONTROL_HEADER = /^(?:if|else|for|while|do|try|catch|finally|switch)\b/;

/**
 * 语句(从起点到收尾行为止的代码)是否是"没有块体的控制流头".
 *
 * `if (ready)` 单独收尾时, 下一行才是它的分支体: 在收尾行之后插日志会把日志变成 if 的
 * 分支体, 原分支体却滑到外面去 (`if (ready)\n  work();` 里没有 else 时, 日志成了无条件
 * 执行的语句, 原本的 work() 反而失去条件). 头后同一行还跟有语句体时行尾插入是安全的.
 * 花括号在后续行的 Allman 形态由续行判定与块路径处理, 到不了这里的调用点.
 */
function isBracelessControlHeader(statementCode: string): boolean {
	const code = statementCode.trim();
	if (!CONTROL_HEADER.test(code)) return false;
	const open = code.indexOf("(");
	if (open === -1) return true; // `else`, `do`, `try` 等裸关键字: 语句体在后续行.
	// 找到与头括号配对的 `)`(跳过字符串字面量); 之后还有内容说明体压在同一行, 行尾插入安全.
	let depth = 0;
	let quote: string | null = null;
	for (let i = open; i < code.length; i++) {
		const ch = code[i];
		if (quote !== null) {
			if (ch === "\\") i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "(") depth++;
		else if (ch === ")") {
			depth--;
			if (depth === 0) return code.slice(i + 1).trim() === "";
		}
	}
	return true; // 头括号到收尾仍未配对: 体必然在后续行.
}

/**
 * 判断某个 offset 落在代码, 注释还是字符串字面量里.
 *
 * 走全文档状态表而不是只看本行前缀: 跨行模板字符串, Python 三引号与块注释里的光标只有拿到
 * 之前各行的状态才能判对. 旧实现从"本行开头, 深度归零"起算, 因此这三种情形都会被判成代码,
 * 日志被插进字符串或注释里.
 */
export function classifyOffset(
	snapshot: DocumentSnapshot,
	offset: number,
	config: ScanConfig
): "code" | "comment" | "string" {
	const lexConfig = toLexConfig(config);
	return classifyAt(snapshot, offset, statesFor(snapshot, config, lexConfig), lexConfig);
}

/**
 * 目标行入口栈里**不需要**闭合的项数.
 *
 * 只需闭合到最近的块边界: 包含目标的那个块不必闭合(日志正是要落在块内), 而块内侧的每个
 * 括号, 方括号与对象字面量都必须闭合, 否则日志会插到它们中间.
 */
function keptDepth(stack: readonly OpenDelimiter[]): number {
	for (let i = stack.length - 1; i >= 0; i--) {
		if (stack[i].kind === "brace-block") {
			return i + 1;
		}
	}
	return 0;
}

/**
 * 块头里是否出现了"不能容纳语句"的关键字.
 *
 * 只在该行已被判为块开始时才查 —— 因此 `const type = { … }` 这类字面量不会被 `type` 误命中.
 * 匹配的是"独立成词且不是属性名"的关键字, 因此 `export class A {` 与 `const A = class {` 都能
 * 命中, 而 `classify(a)` 与 `if (input.type === "file")` 都不会 —— 后者若把 `.type` 也算上,
 * 每个带 `.type` 的条件头都会被误判成受限块.
 */
function isRestrictedBlock(headerCode: string, keywords: readonly string[] | undefined): boolean {
	if (keywords === undefined || keywords.length === 0) {
		return false;
	}
	// 返回类型注解不参与匹配: `(): { type: string } {` 里的 `type` 是属性名, 不是 TS 的 `type` 声明.
	const typeStart = returnTypeStart(headerCode);
	const code = typeStart === null ? headerCode : headerCode.slice(0, typeStart);
	return new RegExp(`(^|[\\s(;{,=])(${keywords.join("|")})([^\\w$]|$)`).test(code);
}

/**
 * 非花括号语言的块开始判定; 判定对象是语句的收尾行本身.
 *
 * 缩进型看行尾的 `:`, 因此 `def f(\n  value\n):` 这种多行签名也能命中 —— 收尾行正是 `):`.
 * 关键字型看行尾的 `do` / `then` 或行首关键字, 但要排除两种压成一行的写法:
 * Elixir 的 `def f(v), do: v` 与 Ruby 的 endless method `def f(v) = v`, 它们没有块体.
 */
function opensStyleBlock(code: string, config: ScanConfig): boolean {
	const trimmed = code.trim();
	if (trimmed === "") {
		return false;
	}
	if (config.blockStyle === "colon-indent") {
		return trimmed.endsWith(":");
	}
	if (config.blockStyle !== "keyword") {
		return false;
	}
	if (/(^|[^\w?!])do:/.test(trimmed)) {
		return false;
	}
	if (/^def\b[^=]*=/.test(trimmed)) {
		return false;
	}
	// `... do`, `... do |item|`, `... then` 都是块开始.
	if (/\bdo(\s*\|[^|]*\|)?$/.test(trimmed) || /\bthen$/.test(trimmed)) {
		return true;
	}
	const first = /^([A-Za-z_][\w?!]*)/.exec(trimmed)?.[1];
	return first !== undefined && (config.blockOpenKeywords ?? []).includes(first);
}

/**
 * 块内第一条语句该用的缩进.
 *
 * 优先照抄块里已有那一行的缩进 —— 与文件现有风格一致, 混用 tab 与空格的仓库也不会错.
 * 只有空块才回退到"块头缩进 + 一级", 因为那时没有可抄的对象. 把闭合符那一行当成空块:
 * 抄它的缩进会得到与块头相同的缩进, 在 Python 下就是 IndentationError.
 */
function blockIndent(snapshot: DocumentSnapshot, anchorLine: number, blockLine: number): string {
	if (anchorLine + 1 < snapshot.lineCount) {
		const next = snapshot.lineAt(anchorLine + 1);
		const trimmed = next.text.trim();
		if (trimmed !== "" && !/^[)\]}]/.test(trimmed) && trimmed !== "end") {
			return leadingWhitespace(next.text);
		}
	}
	return leadingWhitespace(snapshot.lineAt(blockLine).text) + snapshot.indentUnit;
}

/**
 * 找到日志该落在哪一行.
 *
 * 从目标行向下扫描, 在满足全部三条时收尾:
 * 1. **最内层未闭合的块之上没有任何未闭合的定界符** —— 括号, 方括号与对象字面量都必须闭合,
 *    否则日志会插进它们中间; 块自身不必闭合, 因为日志正是要落在块内. 少了这一条,
 *    `const v = f(` 会在目标行当场收尾, 日志被插进括号里;
 * 2. 不在未闭合字符串内, 也不在块注释内;
 * 3. 该行不是续行.
 *
 * 收尾时若最内层未闭合的块是在目标行之后新开的, 说明目标行开启了一个块, 日志落到块内第一条
 * 语句的位置; 否则日志落在语句之后, 缩进跟随目标行. 以"出口栈的最内层块"而不是"目标行入口栈"
 * 作边界, 是为了让 `list.map(item => {` 这种开在未闭合括号内的块也算块 —— 否则日志会被推到
 * `});` 之外, 而 `item` 在那里根本不在作用域内.
 */
export function locateAnchor(
	snapshot: DocumentSnapshot,
	target: ExpressionTarget,
	config: ScanConfig
): InsertionAnchor | Unsupported {
	const lexConfig = toLexConfig(config);
	const states = statesFor(snapshot, config, lexConfig);

	const classification = classifyAt(snapshot, target.sourceRange.start, states, lexConfig);
	if (classification === "comment") {
		return unsupported("cursor-in-comment");
	}
	if (classification === "string") {
		return unsupported("cursor-in-string");
	}

	const entryStack = states[target.sourceLine].stack;
	const kept = keptDepth(entryStack);
	/** 语句首行: 最外层还需要闭合的定界符所在行, 目标行自己开语句时两者相同. */
	const statementStartLine = entryStack[kept]?.line ?? target.sourceLine;
	/**
	 * 语句首行的缩进.
	 *
	 * 取语句首行, 而不是目标所在的行: 目标落在多行调用的某个参数上时, 那一行是缩进过的,
	 * 拿它的缩进会让日志与 `);` 对不齐. 目标行本身就是语句首行时两者相同, 因此"缩进跟随
	 * 目标行"的既有行为没有改变.
	 */
	const statementIndent = leadingWhitespace(snapshot.lineAt(statementStartLine).text);
	const lastLine = Math.min(target.sourceLine + MAX_STATEMENT_LINES, snapshot.lineCount) - 1;

	for (let index = target.sourceLine; index <= lastLine; index++) {
		const line = snapshot.lineAt(index);
		const exit: LexState = states[index + 1];

		// 弹出了目标所在的块: 要么目标所在块在本行内闭合(开闭都压在一行或块尾行带收尾语句,
		// 例如 `function f() { return value; }`), 要么文件语法残缺. 前者在行尾插入会让日志
		// 落到块外, 目标不在作用域内; 后者继续扫也不会更好. 只有确认目标块仍在本行之后才
		// 就地收尾 —— 那意味着块根本没有包住目标, 属于残缺文件的兜底.
		if (exit.stack.length < kept) {
			const span = delimiterSpan(snapshot, lexConfig, target.sourceRange.start);
			if (span !== null && span.kind === "brace-block" && span.end <= line.end) {
				return unsupported("unbalanced-syntax");
			}
			return {
				kind: "anchor",
				line: index,
				offset: line.end,
				indent: statementIndent,
				placement: "after-line",
			};
		}

		// 最内层块之上还有没闭合的括号或字面量时不能收尾.
		const aboveInnermostBlock = exit.stack.slice(keptDepth(exit.stack));
		if (aboveInnermostBlock.length > 0 || exit.openQuote !== null || exit.inBlockComment) {
			continue;
		}

		const code = stripLineComment(line.text, lexConfig);
		const nextCode =
			index + 1 < snapshot.lineCount
				? stripLineComment(snapshot.lineAt(index + 1).text, lexConfig)
				: "";
		// 块开始判定必须先于续行判定: Ruby 的 `items.each do |item|` 以 `|` 收尾, 而 `|` 是续行符,
		// 顺序反了这行就会被当成未结束的语句, 日志被推到块外.
		const opensStyleBlockHere = opensStyleBlock(code, config);
		if (!opensStyleBlockHere && isContinuation(code, nextCode)) {
			continue;
		}

		/** 块里放不了语句, 只能把日志放到这条语句之前. */
		const beforeLine = (at: number): InsertionAnchor => {
			const header = snapshot.lineAt(at);
			return {
				kind: "anchor",
				line: at,
				offset: header.start,
				indent: leadingWhitespace(header.text),
				placement: "before-line",
			};
		};
		const afterLine = (indent: string): InsertionAnchor => ({
			kind: "anchor",
			line: index,
			offset: line.end,
			indent,
			placement: "after-line",
		});

		const innermost = exit.stack[exit.stack.length - 1];
		// 块是在目标行或其后新开的 —— 那才说明目标行开启了一个块, 日志要落进去.
		const opensBraceBlock =
			innermost !== undefined &&
			innermost.kind === "brace-block" &&
			innermost.line >= target.sourceLine;

		if (opensBraceBlock) {
			// 关键字要从 `{` 往回找: Allman 风格下 `switch (x)` 与 `{` 不在同一行, 插错位置会把
			// 日志夹在两者之间.
			const header = codeBeforeDelimiter(
				snapshot,
				lexConfig,
				innermost.line,
				innermost.column
			);
			return isRestrictedBlock(header.code, config.restrictedBlockKeywords)
				? beforeLine(header.line)
				: afterLine(blockIndent(snapshot, index, innermost.line));
		}

		// 缩进型与关键字型语言的块头就是收尾这一行本身.
		if (opensStyleBlockHere) {
			return isRestrictedBlock(code, config.restrictedBlockKeywords)
				? beforeLine(index)
				: afterLine(blockIndent(snapshot, index, index));
		}

		// 到这里只能是"日志插在语句收尾行之后". 几种形态会写出坏代码, 拒绝并报找不到安全位置:
		// - 无块体的控制流头 (`if (ready)` 单独收尾): 下一行才是分支体, 插在中间会改变语义;
		// - 目标所在的花括号块在本行内已经闭合 (`if (x) { work(y); }`): 插在行尾会落到块外;
		// - 目标在签名或条件括号里, 括号后紧跟同行闭合的函数体块
		//   (`function f(value) { return value; }` 的形参): 参数在插入点已不在作用域内.
		let statementCode = "";
		for (let probe = statementStartLine; probe <= index; probe++) {
			statementCode += ` ${stripLineComment(snapshot.lineAt(probe).text, lexConfig)}`;
		}
		if (isBracelessControlHeader(statementCode)) {
			return unsupported("unbalanced-syntax");
		}
		const span = delimiterSpan(snapshot, lexConfig, target.sourceRange.start);
		if (span !== null && span.end <= line.end) {
			if (span.kind === "brace-block") return unsupported("unbalanced-syntax");
			if (span.kind === "paren" || span.kind === "bracket") {
				let probe = span.end;
				while (probe < snapshot.text.length && /\s/.test(snapshot.text[probe])) probe++;
				if (snapshot.text[probe] === "{") {
					const block = delimiterSpan(snapshot, lexConfig, probe);
					if (block !== null && block.kind === "brace-block" && block.end <= line.end) {
						return unsupported("unbalanced-syntax");
					}
				}
			}
		}

		return afterLine(statementIndent);
	}

	return unsupported("unbalanced-syntax");
}
