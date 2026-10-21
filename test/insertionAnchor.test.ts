import { describe, expect, it } from "vitest";

import { planEdits } from "../src/core/planEdits";
import { getAdapter } from "../src/languages/registry";

import { apply, caretIn, snap } from "./helpers";

/**
 * 插入位置的回归样例。
 *
 * 每条对应一类曾经真实发生过的错位, 断言的是**插入后的完整文本**而不只是锚点行号 —— 语法被
 * 破坏时一眼就能看见, 只比行号的话很容易漏。分类沿用调研时的编号:
 * A 类是产出的代码被改坏, B 类是日志跑到作用域外, C 类是非花括号语言的缩进。
 */

/** 在 needle 处插入一条日志, 返回插入后的完整文本。 */
function insert(languageId: string, text: string, needle: string): string {
	const adapter = getAdapter(languageId);
	if (!adapter) throw new Error(`没有 ${languageId} 的适配器`);
	return apply(
		text,
		planEdits(snap(text, languageId), adapter, "[D]", [caretIn(text, needle)], "insert")
	);
}

/** 只取失败原因, 用于断言"拒绝插入"。 */
function reason(languageId: string, text: string, needle: string): string | null {
	const adapter = getAdapter(languageId);
	if (!adapter) throw new Error(`没有 ${languageId} 的适配器`);
	const plan = planEdits(
		snap(text, languageId),
		adapter,
		"[D]",
		[caretIn(text, needle)],
		"insert"
	);
	expect(plan.edits).toEqual([]);
	return plan.firstReason;
}

const LOG = (expr: string) => `console.log('[D] ${expr}:', ${expr}); // ect:v1`;

describe("A 类 · 曾把代码改坏的位置", () => {
	it("A1 多行参数列表内部: 日志落在整条语句之后, 不再插进参数列表", () => {
		const text = "send(\n  payload,\n  headers\n);\nnext();\n";
		expect(insert("javascript", text, "payload")).toBe(
			`send(\n  payload,\n  headers\n);\n${LOG("payload")}\nnext();\n`
		);
	});

	it("A2 多行对象字面量内部: 日志落在字面量之后", () => {
		const text = "const o = {\n  name: value,\n};\nnext();\n";
		expect(insert("javascript", text, "value")).toBe(
			`const o = {\n  name: value,\n};\n${LOG("value")}\nnext();\n`
		);
	});

	it("A3 运算符续行: 日志不再把表达式从中间截断", () => {
		const text = "const ok = first &&\n  second;\nnext();\n";
		expect(insert("javascript", text, "first")).toBe(
			`const ok = first &&\n  second;\n${LOG("first")}\nnext();\n`
		);
	});

	it("A4 三元续行: 运算符在行首同样能识别", () => {
		const text = "const v = cond\n  ? a\n  : b;\nnext();\n";
		expect(insert("javascript", text, "cond")).toBe(
			`const v = cond\n  ? a\n  : b;\n${LOG("cond")}\nnext();\n`
		);
	});

	it("A5 class 体: 方法签名落进方法体, class 头落到 class 之前", () => {
		const method = "class A {\n  run(arg) {\n    return arg;\n  }\n}\n";
		expect(insert("javascript", method, "arg")).toBe(
			`class A {\n  run(arg) {\n    ${LOG("arg")}\n    return arg;\n  }\n}\n`
		);

		// class body 里放语句是语法错误, 因此日志只能落到 class 之前。
		const header = "class A extends Base {\n  run() {}\n}\n";
		expect(insert("javascript", header, "Base")).toBe(
			`${LOG("Base")}\nclass A extends Base {\n  run() {}\n}\n`
		);

		// 泛型 class 头以 `>` 收尾, 同样要认成块, 否则日志会被推到整个 class 之后。
		const generic = "class A<T> extends Base<T> {\n  run() {}\n}\n";
		expect(insert("typescript", generic, "Base")).toBe(
			`${LOG("Base")}\nclass A<T> extends Base<T> {\n  run() {}\n}\n`
		);
	});

	it("A6 跨行模板字符串内部: 拒绝插入", () => {
		const text = "const s = `\ninner value\n`;\n";
		expect(reason("javascript", text, "inner")).toBe("cursor-in-string");
	});

	it("A7 块注释内部: 拒绝插入", () => {
		const text = "/*\nconst hidden = 1;\n*/\nnext();\n";
		expect(reason("javascript", text, "hidden")).toBe("cursor-in-comment");
	});

	it("A7b Python 三引号内部同样拒绝", () => {
		const text = 's = """\ninner value\n"""\n';
		expect(reason("python", text, "inner")).toBe("cursor-in-string");
	});
});

describe("B 类 · 曾跑到作用域外的位置", () => {
	it("B1 函数签名: 日志落在函数体第一行", () => {
		const text = "function fileSrc(input) {\n\tlet res = [];\n\treturn res;\n}\n";
		expect(insert("javascript", text, "input")).toBe(
			`function fileSrc(input) {\n\t${LOG("input")}\n\tlet res = [];\n\treturn res;\n}\n`
		);
	});

	it("B2 条件头: 日志落在 if 块内", () => {
		const text = 'if (input && input.type === "file") {\n\trun();\n}\n';
		expect(insert("javascript", text, "(input")).toBe(
			`if (input && input.type === "file") {\n\t${LOG("input")}\n\trun();\n}\n`
		);
	});

	it("B3 箭头函数体: 日志落在回调体内, 参数在那里才有定义", () => {
		const text =
			"res = [].map.call(files, _file => {\n\tconst file = _file;\n\treturn file;\n});\n";
		expect(insert("javascript", text, "_file")).toBe(
			`res = [].map.call(files, _file => {\n\t${LOG("_file")}\n\tconst file = _file;\n\treturn file;\n});\n`
		);
	});

	it("B4 for 头: 日志落在循环体内", () => {
		const text = "for (const item of list) {\n  use(item);\n}\n";
		expect(insert("javascript", text, "const item")).toBe(
			`for (const item of list) {\n  ${LOG("item")}\n  use(item);\n}\n`
		);
	});

	it("B5 返回类型带泛型, 数组或对象类型: 日志仍落在函数体内", () => {
		// 曾把 `): Promise<User> {` 的 `{` 判成对象字面量, 日志被推到函数的 `}` 之后。
		const body = (header: string, indent = "  ") => [
			`${header}\n${indent}const user = 1;\n`,
			`${header}\n${indent}const user = 1;\n${indent}${LOG("user")}\n`,
		];
		const headers = [
			"function f(): Promise<User> {",
			"function f(): Map<string, number> {",
			"function f(): User[] {",
			"function f<T>(x: T): T[] {",
			"function f(): { type: string } {",
			"function f(): [number, string] {",
			"function f(\n  a: number,\n): Promise<() => void> {",
		];
		for (const languageId of ["typescript", "javascript"]) {
			for (const header of headers) {
				const [text, expected] = body(header);
				expect(
					insert(languageId, `${text}}\n`, "const user"),
					`${languageId}: ${header}`
				).toBe(`${expected}}\n`);
			}
		}

		const method = "class A {\n  async load(): Promise<T> {\n    const user = 1;\n  }\n}\n";
		expect(insert("typescript", method, "const user")).toBe(
			`class A {\n  async load(): Promise<T> {\n    const user = 1;\n    ${LOG("user")}\n  }\n}\n`
		);
	});

	it("B6 其他语言的返回类型注解同样按函数体处理", () => {
		expect(
			insert("rust", "fn f() -> Result<(), E> {\n    let user = 1;\n}\n", "let user")
		).toBe(
			'fn f() -> Result<(), E> {\n    let user = 1;\n    println!("[D] user: {:?}", user); // ect:v1\n}\n'
		);
		expect(insert("kotlin", "fun f(): Int? {\n    val user = 1\n}\n", "val user")).toBe(
			'fun f(): Int? {\n    val user = 1\n    println("[D] user: ${user}") // ect:v1\n}\n'
		);
	});
});

describe("C 类 · 非花括号语言的缩进", () => {
	it("C1 Python: 日志带块内缩进, 否则文件直接 IndentationError", () => {
		const text = "def f(value):\n    return value\n";
		expect(insert("python", text, "value")).toBe(
			"def f(value):\n    print('[D] value:', value) # ect:v1\n    return value\n"
		);
	});

	it("C2 Ruby 与 Lua: 日志落在块内且缩进跟随块体", () => {
		expect(insert("ruby", "def f(value)\n  value\nend\n", "value")).toBe(
			'def f(value)\n  puts "[D] value: #{(value).inspect}" # ect:v1\n  value\nend\n'
		);
		expect(insert("lua", "function f(value)\n\treturn value\nend\n", "value")).toBe(
			'function f(value)\n\tprint("[D] value:", value) -- ect:v1\n\treturn value\nend\n'
		);
	});

	it("C3 Elixir: do 块内", () => {
		expect(insert("elixir", "def f(value) do\n\tvalue\nend\n", "value")).toBe(
			'def f(value) do\n\tIO.inspect(value, label: "[D] value") # ect:v1\n\tvalue\nend\n'
		);
	});
});

describe("兜底行为", () => {
	it("空块回退到块头缩进加一级", () => {
		const text = "function f(a) {\n}\n";
		expect(insert("javascript", text, "f(a")).toBe(`function f(a) {\n  ${LOG("a")}\n}\n`);
	});

	it("语句超过 50 行仍未闭合时拒绝插入, 而不是乱插", () => {
		const text = `const v = f(\n${"  x,\n".repeat(80)}`;
		expect(reason("javascript", text, "const v")).toBe("unbalanced-syntax");
	});

	it("每一类位置插入的日志都能被 toggle 原样删掉", () => {
		const cases: [string, string, string][] = [
			["javascript", "function f(input) {\n\treturn input;\n}\n", "input"],
			["javascript", "class A extends Base {\n  run() {}\n}\n", "Base"],
			["javascript", "send(\n  payload\n);\n", "payload"],
			["python", "def f(value):\n    return value\n", "value"],
			["ruby", "def f(value)\n  value\nend\n", "value"],
		];
		for (const [languageId, text, needle] of cases) {
			const adapter = getAdapter(languageId)!;
			const once = insert(languageId, text, needle);
			const plan = planEdits(
				snap(once, languageId),
				adapter,
				"[D]",
				[caretIn(once, needle)],
				"toggle"
			);
			expect(apply(once, plan), `${languageId}: ${needle}`).toBe(text);
		}
	});
});
