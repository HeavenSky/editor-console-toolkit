import { describe, expect, it } from "vitest";

import {
	backupName,
	computeChecksum,
	manualApplyCommand,
	manualRestoreCommand,
	planApply,
	staleBackups,
} from "../../src/checksums/core";

/**
 * 纯核心的回归覆盖。
 *
 * `computeChecksum` 用固定向量钉住, 而不是拿实现自己的输出当期望值 —— 算法一旦漂移,
 * 写回 `product.json` 的校验和就是错的, 而错的校验和和没修一样, 编辑器照样报损坏。
 */

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const CORE = "vs/workbench/workbench.desktop.main.js";
const OTHER = "vs/code/electron-browser/workbench/workbench.html";

/** 键序刻意固定, 用来断言写回时不会被重排。 */
const product = (checksums: Record<string, string>): string =>
	JSON.stringify({ nameShort: "Code", checksums, version: "1.132.0" }, null, "\t");

describe("computeChecksum", () => {
	it("sha256 的 base64, 去掉尾部填充", () => {
		expect(computeChecksum(bytes("hello"))).toBe("LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ");
		expect(computeChecksum(bytes(""))).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU");
		expect(computeChecksum(bytes("abc"))).toBe("ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0");
	});

	it("结果里不出现 base64 填充符", () => {
		expect(computeChecksum(bytes("hello"))).not.toMatch(/=/);
	});
});

describe("planApply", () => {
	it("没有 checksums 字段时不做任何事", () => {
		const plan = planApply(JSON.stringify({ nameShort: "Code" }), () => "anything");
		expect(plan.kind).toBe("no-checksums");
		expect(plan.nextText).toBeNull();
	});

	it("checksums 为空对象时同样不做任何事", () => {
		// 上游在这里提示之后没有 return, 紧接着 Object.entries(undefined) 直接抛错。
		const plan = planApply(product({}), () => "anything");
		expect(plan.kind).toBe("no-checksums");
	});

	it("全部一致时不产出待写内容", () => {
		const plan = planApply(product({ [CORE]: "same" }), () => "same");
		expect(plan.kind).toBe("unchanged");
		expect(plan.changes).toEqual([]);
		expect(plan.nextText).toBeNull();
	});

	it("只改动不一致的条目, 其余原样保留", () => {
		const plan = planApply(product({ [CORE]: "stale", [OTHER]: "same" }), path =>
			path === CORE ? "fresh" : "same"
		);

		expect(plan.kind).toBe("changed");
		expect(plan.changes).toEqual([{ path: CORE, from: "stale", to: "fresh" }]);

		const next = JSON.parse(plan.nextText ?? "") as { checksums: Record<string, string> };
		expect(next.checksums[CORE]).toBe("fresh");
		expect(next.checksums[OTHER]).toBe("same");
	});

	it("写回内容用 tab 缩进, 保持键序, 且不以换行结尾", () => {
		const plan = planApply(product({ [CORE]: "stale" }), () => "fresh");
		const text = plan.nextText ?? "";

		expect(text).toContain('\n\t"nameShort": "Code"');
		expect(Object.keys(JSON.parse(text) as object)).toEqual([
			"nameShort",
			"checksums",
			"version",
		]);
		expect(text.endsWith("\n")).toBe(false);
	});

	it("磁盘上缺失的文件被跳过而不是让整次修复失败", () => {
		const plan = planApply(product({ [CORE]: "stale", "vs/gone.js": "whatever" }), path =>
			path === CORE ? "fresh" : undefined
		);

		expect(plan.kind).toBe("changed");
		expect(plan.missing).toEqual(["vs/gone.js"]);
		expect(plan.changes.map(change => change.path)).toEqual([CORE]);
	});

	it("全部条目都缺失时结论是无需变更", () => {
		const plan = planApply(product({ [CORE]: "stale" }), () => undefined);
		expect(plan.kind).toBe("unchanged");
		expect(plan.missing).toEqual([CORE]);
	});

	it("内容不是合法 JSON 时抛出, 由调用方归类为读取失败", () => {
		expect(() => planApply("{ not json", () => "fresh")).toThrow(SyntaxError);
	});
});

describe("backupName", () => {
	it("由版本号派生", () => {
		expect(backupName("1.132.0")).toBe("product.json.ect-orig.1.132.0");
	});

	it("把版本号里不能进文件名的字符换成下划线", () => {
		expect(backupName("1.99.0-insider/x")).toBe("product.json.ect-orig.1.99.0-insider_x");
	});
});

describe("staleBackups", () => {
	it("当前版本的备份不算陈旧", () => {
		// 这里错一次就会删掉唯一的还原来源, 所以必须按完整文件名比较。
		const entries = [
			"product.json",
			"product.json.ect-orig.1.132.0",
			"product.json.ect-orig.1.99.0",
		];
		expect(staleBackups(entries, "1.132.0")).toEqual(["product.json.ect-orig.1.99.0"]);
	});

	it("不认上游插件的备份命名", () => {
		const entries = ["product.json.orig.1.132.0", "product.json.orig.1.99.0"];
		expect(staleBackups(entries, "1.132.0")).toEqual([]);
	});

	it("前缀之后没有版本段的文件不算备份", () => {
		expect(staleBackups(["product.json.ect-orig."], "1.132.0")).toEqual([]);
	});
});

describe("manualApplyCommand", () => {
	const paths = { product: "/app/product.json", staged: "/tmp/ect/product.json" };

	it("备份还不存在时, 先备份再写回", () => {
		expect(manualApplyCommand("darwin", { ...paths, backupToCreate: "/app/backup" })).toBe(
			'sudo cp "/app/product.json" "/app/backup" && sudo cp "/tmp/ect/product.json" "/app/product.json"'
		);
	});

	it("备份已存在时只写回", () => {
		expect(manualApplyCommand("linux", paths)).toBe(
			'sudo cp "/tmp/ect/product.json" "/app/product.json"'
		);
	});

	it("Windows 用 copy /Y", () => {
		expect(manualApplyCommand("win32", { ...paths, backupToCreate: "/app/backup" })).toBe(
			'copy /Y "/app/product.json" "/app/backup" && copy /Y "/tmp/ect/product.json" "/app/product.json"'
		);
	});
});

describe("manualRestoreCommand", () => {
	const paths = { product: "/app/product.json", backup: "/app/backup" };

	it("从备份写回", () => {
		expect(manualRestoreCommand("darwin", paths)).toBe(
			'sudo cp "/app/backup" "/app/product.json"'
		);
	});

	it("Windows 用 copy /Y", () => {
		expect(manualRestoreCommand("win32", paths)).toBe(
			'copy /Y "/app/backup" "/app/product.json"'
		);
	});
});
