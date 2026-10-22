import { describe, expect, it } from "vitest";

import { historySteps, workDataSteps } from "../../src/cleanup/catalog";
import { isCommandNotFound, orderSteps, runSteps, skipReason } from "../../src/cleanup/runner";
import type { ExtensionState, RunSeam, Step } from "../../src/cleanup/types";

/**
 * 清理编排的回归覆盖, 命令执行与扩展状态都换成内存实现。
 *
 * 真实命令会删用户数据, 不能在测试里跑; 这里钉住的是与之无关的几条规则: 排序, 跳过判定,
 * 单条出错不中断, 以及汇总数字。
 */

const identity = { t: (message: string) => message };

const step = (id: string, options: Partial<Step> = {}): Step => ({
	id,
	label: id,
	memoryOnly: false,
	prompts: false,
	workspaceOnly: false,
	...options,
});

function seam(
	behaviour: Record<string, () => Promise<void>>,
	states: Record<string, ExtensionState> = {},
	timeoutMs = 1000
): RunSeam & { executed: string[] } {
	const executed: string[] = [];
	return {
		executed,
		timeoutMs,
		extensionState: id => states[id] ?? "missing",
		execute: async target => {
			executed.push(target.id);
			await (behaviour[target.id] ?? (() => Promise.resolve()))();
		},
	};
}

describe("orderSteps", () => {
	it("不弹框的在前, 同组内保持原顺序", () => {
		const ordered = orderSteps([
			step("a", { prompts: true }),
			step("b"),
			step("c", { prompts: true }),
			step("d"),
		]);
		expect(ordered.map(item => item.id)).toEqual(["b", "d", "a", "c"]);
	});
});

describe("skipReason", () => {
	it("编辑器本体命令从不预先跳过", () => {
		expect(skipReason(step("x"), undefined)).toBeUndefined();
	});

	it("扩展未安装时跳过", () => {
		expect(skipReason(step("x", { extension: "a.b" }), "missing")).toBe("not-installed");
	});

	it("只清内存的命令在扩展未激活时跳过, 激活后执行", () => {
		const memory = step("x", { extension: "a.b", memoryOnly: true });
		expect(skipReason(memory, "inactive")).toBe("inactive");
		expect(skipReason(memory, "active")).toBeUndefined();
	});

	it("清磁盘的命令允许为此激活扩展", () => {
		expect(skipReason(step("x", { extension: "a.b" }), "inactive")).toBeUndefined();
	});
});

describe("isCommandNotFound", () => {
	it("只认 executeCommand 的未注册错误", () => {
		expect(isCommandNotFound(new Error("command 'foo.bar' not found"))).toBe(true);
		expect(isCommandNotFound(new Error("permission denied"))).toBe(false);
	});
});

describe("runSteps", () => {
	it("单条出错不中断后续, 并分别计入跳过与失败", async () => {
		const run = seam({
			missing: () => Promise.reject(new Error("command 'missing' not found")),
			broken: () => Promise.reject(new Error("boom\nstack")),
		});
		const summary = await runSteps(run, [
			step("missing"),
			step("broken"),
			step("ok"),
			step("ext", { extension: "not.installed" }),
		]);

		expect(run.executed).toEqual(["missing", "broken", "ok"]);
		expect(summary).toMatchObject({ done: 1, skipped: 2, failed: 1, timeout: 0 });
		const broken = summary.results.find(result => result.step.id === "broken");
		expect(broken).toMatchObject({ status: "failed", detail: "boom" });
	});

	it("不弹框的条目超时记为未完成并继续", async () => {
		const run = seam({ slow: () => new Promise<void>(() => undefined) }, {}, 10);
		const summary = await runSteps(run, [step("slow"), step("next")]);
		expect(summary).toMatchObject({ done: 1, timeout: 1 });
	});

	it("弹框的条目不设超时", async () => {
		const run = seam(
			{ dialog: () => new Promise<void>(resolve => setTimeout(resolve, 30)) },
			{},
			10
		);
		const summary = await runSteps(run, [step("dialog", { prompts: true })]);
		expect(summary).toMatchObject({ done: 1, timeout: 0 });
	});

	it("进度回调按执行顺序给出序号与总数", async () => {
		const seen: string[] = [];
		const run = seam({});
		run.onStep = (index, total, item) => seen.push(`${index}/${total} ${item.id}`);
		await runSteps(run, [step("a", { prompts: true }), step("b")]);
		expect(seen).toEqual(["1/2 b", "2/2 a"]);
	});
});

describe("catalog", () => {
	const history = historySteps(identity);
	const workData = workDataSteps(identity);

	it("两份清单的条目数与交接清单一致且 ID 不重复", () => {
		expect(history).toHaveLength(27);
		expect(workData).toHaveLength(5);
		const ids = [...history, ...workData].map(item => item.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("只清内存的条目都声明了所属扩展, 否则无法判断是否激活", () => {
		for (const item of [...history, ...workData].filter(entry => entry.memoryOnly)) {
			expect(item.extension, item.id).toBeDefined();
		}
	});

	it("快捷键编辑器那条排在清编辑器历史之前, 打开它产生的记录也会被清掉", () => {
		const ids = orderSteps(history).map(item => item.id);
		expect(ids.indexOf("keybindings.editor.clearSearchHistory")).toBeLessThan(
			ids.indexOf("workbench.action.clearEditorHistoryWithoutConfirm")
		);
	});

	it("排除项不出现在任何清单里", () => {
		const ids = new Set([...history, ...workData].map(item => item.id));
		for (const excluded of [
			"workbench.action.clearEditorHistory",
			"workbench.actions.syncData.reset",
			"github.copilot.chat.clearTemporalContext",
		]) {
			expect(ids.has(excluded), excluded).toBe(false);
		}
	});

	it("删除工作数据的每一项都写明删除位置", () => {
		for (const item of workData) expect(item.detail, item.id).toBeTruthy();
	});
});
