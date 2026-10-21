import { describe, expect, it } from "vitest";

import { planEdits } from "../src/core/planEdits";
import { doubleBraces, escapeLiteral } from "../src/languages/escape";
import { getAdapter } from "../src/languages/registry";

import { apply, caretIn, snap } from "./helpers";

/** 渲染某语言的日志正文; label 与 expression 固定, 只观察语言差异。 */
function body(languageId: string, label = "user", expression = "user", prefix = "[D]"): string {
	const adapter = getAdapter(languageId);
	if (!adapter) throw new Error(`没有 ${languageId} 的适配器`);
	return adapter.renderLog({ prefix, label, expression }).body;
}

describe("registry", () => {
	it("每个声明的 languageId 都能取到适配器", () => {
		const ids = [
			"javascript",
			"javascriptreact",
			"typescript",
			"typescriptreact",
			"python",
			"java",
			"kotlin",
			"csharp",
			"lua",
			"ruby",
			"php",
			"swift",
			"dart",
			"rust",
			"elixir",
		];
		for (const id of ids) expect(getAdapter(id), id).toBeDefined();
	});

	it("未支持的语言返回 undefined", () => {
		expect(getAdapter("plaintext")).toBeUndefined();
		expect(getAdapter("go")).toBeUndefined();
	});

	it("JS 与 TS 共用同一个适配器实例", () => {
		expect(getAdapter("typescript")).toBe(getAdapter("javascript"));
		expect(getAdapter("typescriptreact")).toBe(getAdapter("javascript"));
	});
});

describe("各语言的日志模板", () => {
	it("javascript", () => {
		expect(body("javascript")).toBe("console.log('[D] user:', user);");
	});

	it("python", () => {
		expect(body("python")).toBe("print('[D] user:', user)");
	});

	it("lua", () => {
		expect(body("lua")).toBe('print("[D] user:", user)');
	});

	it("java 用 String.valueOf 避免 null 拼接问题", () => {
		expect(body("java")).toBe('System.out.println("[D] user: " + String.valueOf(user));');
	});

	it("csharp 用复合格式串", () => {
		expect(body("csharp")).toBe('System.Console.WriteLine("[D] user: {0}", user);');
	});

	it("rust 用 Debug 格式化", () => {
		expect(body("rust")).toBe('println!("[D] user: {:?}", user);');
	});

	it("kotlin 用字符串模板", () => {
		expect(body("kotlin")).toBe('println("[D] user: ${user}")');
	});

	it("dart 用 ${} 插值", () => {
		expect(body("dart")).toBe("print('[D] user: ${user}');");
	});

	it("ruby 用 #{} 插值并 inspect", () => {
		expect(body("ruby")).toBe('puts "[D] user: #{(user).inspect}"');
	});

	it("elixir 的 label 不带冒号 (IO.inspect 自己会补)", () => {
		expect(body("elixir")).toBe('IO.inspect(user, label: "[D] user")');
	});

	it("php 的 $ 不需要转义 (单引号字符串不插值)", () => {
		expect(body("php", "$user", "$user")).toBe("var_dump('[D] $user:', $user);");
	});

	it("swift", () => {
		expect(body("swift")).toBe('print("[D] user:", user)');
	});
});

describe("可见文本的转义", () => {
	it("引号与反斜杠按语言引号转义", () => {
		expect(escapeLiteral("it's", "'")).toBe("it\\'s");
		expect(escapeLiteral("it's", '"')).toBe("it's");
		expect(escapeLiteral("a\\b", "'")).toBe("a\\\\b");
	});

	it("插值语言额外转义触发字符", () => {
		expect(escapeLiteral("$100", '"', ["$"])).toBe("\\$100");
		expect(escapeLiteral("#tag", '"', ["#"])).toBe("\\#tag");
	});

	it("格式串语言把花括号双写", () => {
		expect(doubleBraces("{a}")).toBe("{{a}}");
		expect(doubleBraces("no braces")).toBe("no braces");
	});

	it("带引号的表达式不会破坏 JS 字面量", () => {
		expect(body("javascript", "obj['k']", "obj['k']")).toBe(
			"console.log('[D] obj[\\'k\\']:', obj['k']);"
		);
	});

	it("rust 的花括号在可见文本里被双写, 不会被当成占位符", () => {
		expect(body("rust", "map{k}", "map")).toBe('println!("[D] map{{k}}: {:?}", map);');
	});

	it("kotlin 可见文本里的 $ 被转义", () => {
		expect(body("kotlin", "cost$", "cost")).toBe('println("[D] cost\\$: ${cost}")');
	});
});

describe("块语法按语言配置", () => {
	/**
	 * 逐语言的端到端断言。
	 *
	 * `blockStyle` 存在适配器闭包里, 从 LanguageAdapter 读不到, 所以断言行为而不是配置值 ——
	 * 反正真正要保证的是"日志落在块内且缩进对", 而不是某个字段等于某个字符串。
	 */
	function insert(languageId: string, text: string, needle: string): string {
		const adapter = getAdapter(languageId);
		if (!adapter) throw new Error(`没有 ${languageId} 的适配器`);
		const snapshot = snap(text, languageId);
		return apply(text, planEdits(snapshot, adapter, "[D]", [caretIn(text, needle)], "insert"));
	}

	it("花括号语言: 日志落在块内第一行", () => {
		expect(insert("java", "void f(int value) {\n\tuse(value);\n}\n", "value")).toBe(
			'void f(int value) {\n\tSystem.out.println("[D] value: " + String.valueOf(value)); // ect:v1\n\tuse(value);\n}\n'
		);
		expect(insert("rust", "fn f(value: i32) {\n\tuse(value);\n}\n", "value")).toBe(
			'fn f(value: i32) {\n\tprintln!("[D] value: {:?}", value); // ect:v1\n\tuse(value);\n}\n'
		);
	});

	it("缩进型语言 (Python): 日志带上块内缩进, 不再是 IndentationError", () => {
		expect(insert("python", "def f(value):\n    return value\n", "value")).toBe(
			"def f(value):\n    print('[D] value:', value) # ect:v1\n    return value\n"
		);
	});

	it("关键字型语言 (Ruby / Lua / Elixir): 日志落在块内", () => {
		expect(insert("ruby", "def f(value)\n  value\nend\n", "value")).toBe(
			'def f(value)\n  puts "[D] value: #{(value).inspect}" # ect:v1\n  value\nend\n'
		);
		expect(insert("lua", "function f(value)\n\treturn value\nend\n", "value")).toBe(
			'function f(value)\n\tprint("[D] value:", value) -- ect:v1\n\treturn value\nend\n'
		);
		expect(insert("elixir", "def f(value) do\n\tvalue\nend\n", "value")).toBe(
			'def f(value) do\n\tIO.inspect(value, label: "[D] value") # ect:v1\n\tvalue\nend\n'
		);
	});

	it("受限块按语言各自登记: Rust 的 match, Ruby 的 case", () => {
		expect(insert("rust", "match kind {\n\t1 => go(),\n}\n", "kind")).toBe(
			'println!("[D] kind: {:?}", kind); // ect:v1\nmatch kind {\n\t1 => go(),\n}\n'
		);
		expect(insert("ruby", "case kind\nwhen 1\n  go\nend\n", "kind")).toBe(
			'puts "[D] kind: #{(kind).inspect}" # ect:v1\ncase kind\nwhen 1\n  go\nend\n'
		);
	});
});

describe("markerPattern", () => {
	it("注释符跟随语言", () => {
		expect(getAdapter("javascript")!.commentPrefix).toBe("//");
		expect(getAdapter("python")!.commentPrefix).toBe("#");
		expect(getAdapter("lua")!.commentPrefix).toBe("--");
	});

	it("同一适配器多次取到同一个 pattern 实例 (无 lastIndex 副作用)", () => {
		const adapter = getAdapter("javascript")!;
		expect(adapter.markerPattern()).toBe(adapter.markerPattern());
		const pattern = adapter.markerPattern();
		expect(pattern.test("a; // ect:v1")).toBe(true);
		expect(pattern.test("a; // ect:v1")).toBe(true);
	});
});
