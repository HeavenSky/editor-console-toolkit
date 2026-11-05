import { describe, expect, it } from "vitest";

import { killProcesses, summarizeOutcomes } from "../../src/ports/kill";
import type { KillDeps, KillReport, KillTarget } from "../../src/ports/kill";
import type { RunCommand } from "../../src/ports/types";

/**
 * 全程使用注入的假接缝与假时钟, **不真实终止任何进程**, 也不真的等待。
 */

const target = (over: Partial<KillTarget> = {}): KillTarget => ({
	pid: 41802,
	expectedCommand: "node vite --host",
	expectedCreated: "start-1",
	name: "node",
	...over,
});

interface Harness {
	deps: KillDeps;
	signals: Array<{ pid: number; signal: NodeJS.Signals | 0 }>;
	commands: Array<{ file: string; args: string[] }>;
	waited: number[];
}

/**
 * @param dieAfter 进程在收到第 N 次信号后是否仍存活; `dieAfter` 表示第几次 SIGTERM/SIGKILL 之后消失,
 *              `Infinity` 表示怎么都不死。
 */
function harness(options: {
	/** 每次 `ps`/PowerShell 身份读取返回的命令行; 超出后沿用最后一项。 */
	currentCommand?: string | null;
	commandSequence?: Array<string | null>;
	/** 每次 POSIX 创建标识查询返回的创建时间; PowerShell 读取则随命令行一起返回。 */
	currentCreated?: string | null;
	createdSequence?: Array<string | null>;
	/** 身份查询本身失败时抛出的错误。 */
	runThrows?: string;
	/** 存活探测抛出的错误消息; 无 errno 的错误表示探测失败而非进程消失。 */
	probeThrows?: string;
	/** 与 `probeThrows` 搭配的 errno; `ESRCH` 表示进程消失, `EPERM` 表示无权发信号。 */
	probeErrno?: string;
	dieAfter?: number;
	platform?: NodeJS.Platform;
	signalThrows?: boolean;
}): Harness {
	const signals: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = [];
	const commands: Array<{ file: string; args: string[] }> = [];
	const waited: number[] = [];
	let realSignalCount = 0;
	let identityReads = 0;
	let createdReads = 0;

	const run: RunCommand = async (file, args) => {
		commands.push({ file, args });
		if (file === "ps" && args.includes("lstart=")) {
			if (options.runThrows !== undefined) throw new Error(options.runThrows);
			createdReads += 1;
			let created: string | null | undefined =
				options.currentCreated === undefined ? "start-1" : options.currentCreated;
			if (options.createdSequence !== undefined) {
				created =
					options.createdSequence[
						Math.min(createdReads - 1, options.createdSequence.length - 1)
					];
			}
			return { stdout: created === null ? "" : `${created}\n`, stderr: "", code: 0 };
		}

		if (file === "ps" || file === "powershell.exe") {
			if (options.runThrows !== undefined) throw new Error(options.runThrows);
			identityReads += 1;
			let command: string | null | undefined =
				options.currentCommand === undefined ? "node vite --host" : options.currentCommand;
			if (options.commandSequence !== undefined) {
				command =
					options.commandSequence[
						Math.min(identityReads - 1, options.commandSequence.length - 1)
					];
			}
			const created =
				options.createdSequence === undefined
					? (options.currentCreated ?? "start-1")
					: (options.createdSequence[
							Math.min(identityReads - 1, options.createdSequence.length - 1)
						] ?? "");
			if (file === "powershell.exe") {
				return {
					stdout:
						command === null
							? ""
							: JSON.stringify({ Command: command, Created: created || null }),
					stderr: "",
					code: 0,
				};
			}
			return { stdout: command === null ? "" : `${command}\n`, stderr: "", code: 0 };
		}
		if (file === "taskkill") realSignalCount += 1;
		return { stdout: "", stderr: "", code: 0 };
	};

	const deps: KillDeps = {
		run,
		sendSignal: (pid, signal) => {
			if (signal === 0) {
				// 存活探测: 抛 ESRCH 形态的错误表示进程已消失; probeThrows 模拟探测本身失败。
				if (options.probeThrows !== undefined) {
					throw Object.assign(new Error(options.probeThrows), {
						code: options.probeErrno,
					});
				}
				if (realSignalCount >= (options.dieAfter ?? 1)) {
					throw Object.assign(new Error("process not found"), { code: "ESRCH" });
				}
				return;
			}
			signals.push({ pid, signal });
			if (options.signalThrows) throw new Error("EPERM");
			realSignalCount += 1;
		},
		wait: async ms => {
			waited.push(ms);
		},
		platform: options.platform ?? "darwin",
		killTimeout: 1000,
	};

	return { deps, signals, commands, waited };
}

describe("killProcesses 的 PID 复用校验", () => {
	it("命令行不一致时不发出任何信号", async () => {
		const h = harness({ currentCommand: "node other-thing.js" });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("skipped-changed");
		expect(h.signals).toEqual([]);
		expect(h.commands.every(call => call.file === "ps")).toBe(true);
	});

	it("把实际命令行放进 detail 供上层展示", async () => {
		const h = harness({ currentCommand: "node other-thing.js" });
		const [report] = await killProcesses([target()], h.deps);
		expect(report.detail).toBe("node other-thing.js");
	});

	it("命令行相同但创建标识不同时不发出任何信号", async () => {
		const h = harness({ currentCreated: "start-2" });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("skipped-changed");
		expect(h.signals).toEqual([]);
	});

	it("进程已经不存在时视为已终止, 不发信号", async () => {
		const h = harness({ currentCommand: null });
		const [report] = await killProcesses([target()], h.deps);
		expect(report.outcome).toBe("terminated");
		expect(h.signals).toEqual([]);
	});

	it("升级 SIGKILL 前 PID 被复用时停止发送信号", async () => {
		const h = harness({
			commandSequence: ["node vite --host", "node unrelated.js"],
			dieAfter: Number.POSITIVE_INFINITY,
		});
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("skipped-changed");
		expect(report.detail).toBe("node unrelated.js");
		// 只发过 SIGTERM, SIGKILL 必须没有落到新身份头上。
		expect(h.signals.map(item => item.signal)).toEqual(["SIGTERM"]);
	});

	it("升级 SIGKILL 前进程已消失时不再强杀", async () => {
		const h = harness({
			commandSequence: ["node vite --host", null],
			dieAfter: Number.POSITIVE_INFINITY,
		});
		const [report] = await killProcesses([target()], h.deps);
		expect(report.outcome).toBe("terminated");
		expect(h.signals.map(item => item.signal)).toEqual(["SIGTERM"]);
	});

	it("升级 SIGKILL 前创建标识变化时不再强杀", async () => {
		const h = harness({
			createdSequence: ["start-1", "start-2"],
			dieAfter: Number.POSITIVE_INFINITY,
		});
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("skipped-changed");
		expect(h.signals.map(item => item.signal)).toEqual(["SIGTERM"]);
	});
});

describe("killProcesses 的查询与探测失败处理", () => {
	it("身份查询失败时报 failed 并保留原因, 不发信号", async () => {
		const h = harness({ runThrows: "ps 执行失败: timeout" });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("failed");
		expect(report.detail).toContain("timeout");
		expect(h.signals).toEqual([]);
	});

	it("存活探测失败(无 errno)时报 failed, 不升级强杀", async () => {
		const h = harness({ probeThrows: "ps timed out", dieAfter: 1 });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("failed");
		expect(report.detail).toContain("ps timed out");
		expect(h.signals.map(item => item.signal)).toEqual(["SIGTERM"]);
	});

	it("EPERM 探测视为仍然存活, 照常走升级流程", async () => {
		const h = harness({
			probeThrows: "EPERM",
			probeErrno: "EPERM",
			dieAfter: Number.POSITIVE_INFINITY,
		});
		const [report] = await killProcesses([target()], h.deps);

		// EPERM 表示进程存在: 探测一直返回存活, 最终按 SIGKILL 无效处理。
		expect(report.outcome).toBe("failed");
		expect(report.detail).toBe("process survived SIGKILL");
		expect(h.signals.map(item => item.signal)).toEqual(["SIGTERM", "SIGKILL"]);
	});
});

describe("killProcesses 的升级策略", () => {
	it("SIGTERM 后立即消失的进程不会收到 SIGKILL", async () => {
		const h = harness({ dieAfter: 1 });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("terminated");
		expect(h.signals.map(item => item.signal)).toEqual(["SIGTERM"]);
	});

	it("SIGTERM 无效时升级到 SIGKILL", async () => {
		const h = harness({ dieAfter: 2 });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("killed");
		expect(h.signals.map(item => item.signal)).toEqual(["SIGTERM", "SIGKILL"]);
	});

	it("SIGKILL 也无效时报 failed", async () => {
		const h = harness({ dieAfter: Number.POSITIVE_INFINITY });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("failed");
		expect(report.detail).toBe("process survived SIGKILL");
	});

	it("等待期间按固定间隔轮询, 不超过 killTimeout", async () => {
		const h = harness({ dieAfter: Number.POSITIVE_INFINITY });
		await killProcesses([target()], h.deps);

		expect(h.waited.every(ms => ms === 200)).toBe(true);
		// killTimeout 1000ms / 200ms = 5 次轮询, SIGTERM 与 SIGKILL 各一轮。
		expect(h.waited).toHaveLength(10);
	});

	it("发信号本身失败时报 failed 并带上原因", async () => {
		const h = harness({ signalThrows: true });
		const [report] = await killProcesses([target()], h.deps);

		expect(report.outcome).toBe("failed");
		expect(report.detail).toContain("EPERM");
	});
});

describe("killProcesses 在 Windows 上", () => {
	it("先 taskkill 再 taskkill /F, 且不加 /T", async () => {
		const h = harness({ dieAfter: 2, platform: "win32" });
		const [report] = await killProcesses([target()], h.deps);

		const taskkills = h.commands.filter(call => call.file === "taskkill");
		expect(report.outcome).toBe("killed");
		expect(taskkills[0].args).toEqual(["/PID", "41802"]);
		expect(taskkills[1].args).toEqual(["/F", "/PID", "41802"]);
		expect(taskkills.some(call => call.args.includes("/T"))).toBe(false);
	});

	it("用 PowerShell 而不是 ps 读命令行", async () => {
		const h = harness({ dieAfter: 1, platform: "win32" });
		await killProcesses([target()], h.deps);
		expect(h.commands[0].file).toBe("powershell.exe");
		const script = h.commands[0].args[3];
		expect(script).toContain("CreationDate");
		expect(script).toContain("ToString('o')");
	});
});

describe("killProcesses 批量", () => {
	it("逐项返回结果, 一项失败不影响其余", async () => {
		const h = harness({ dieAfter: 1 });
		const reports = await killProcesses(
			[target({ pid: 1 }), target({ pid: 2 }), target({ pid: 3 })],
			h.deps
		);
		expect(reports).toHaveLength(3);
		expect(reports.map(report => report.target.pid)).toEqual([1, 2, 3]);
	});

	it("空目标列表返回空结果, 不发任何命令", async () => {
		const h = harness({});
		expect(await killProcesses([], h.deps)).toEqual([]);
		expect(h.commands).toEqual([]);
	});
});

describe("summarizeOutcomes", () => {
	const report = (outcome: KillReport["outcome"], pid: number): KillReport => ({
		target: target({ pid }),
		outcome,
	});

	it("四类计数正确", () => {
		const summary = summarizeOutcomes([
			report("terminated", 1),
			report("terminated", 2),
			report("killed", 3),
			report("skipped-changed", 4),
			report("failed", 5),
		]);
		expect(summary).toMatchObject({ terminated: 2, killed: 1, skipped: 1, failed: 1 });
	});

	it("只把跳过与失败的条目放进 problems", () => {
		const summary = summarizeOutcomes([
			report("terminated", 1),
			report("skipped-changed", 4),
			report("failed", 5),
		]);
		expect(summary.problems.map(item => item.target.pid)).toEqual([4, 5]);
	});

	it("空输入得到全零", () => {
		expect(summarizeOutcomes([])).toEqual({
			terminated: 0,
			killed: 0,
			skipped: 0,
			failed: 0,
			problems: [],
		});
	});
});
