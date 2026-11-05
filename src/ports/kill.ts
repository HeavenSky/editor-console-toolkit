import type { RunCommand, SendSignal } from "./types";

/**
 * 进程终止层。
 *
 * 策略是 SIGTERM → 等待 → SIGKILL, 而不是直接 SIGKILL: dev server 收到 SIGTERM 才有机会
 * 关闭 socket 与清掉临时文件。刻意**不终止进程树** (Windows 不加 `taskkill /T`), 因为
 * "勾了哪几行就杀哪几个进程"必须可预测。
 *
 * 发信号前一定重新校验命令行: 从用户勾选到点确认之间进程可能已经退出, 而 PID 会被系统
 * 复用 —— 不校验就有杀错进程的风险。SIGTERM 无效升级到 SIGKILL 之前还要再校验一次,
 * 因为最长 `killTimeout` 的等待窗口里 PID 同样可能被复用。
 */

/** 存活探测间隔; 与 `killTimeout` 一起决定升级到 SIGKILL 的时机。 */
const POLL_INTERVAL_MS = 200;

export interface KillTarget {
	pid: number;
	/** 勾选时记录的完整命令行, 用于发信号前的复用校验。 */
	expectedCommand: string;
	/** 仅用于结果展示。 */
	name: string;
}

export type KillOutcome =
	/** SIGTERM 后自行退出。 */
	| "terminated"
	/** SIGTERM 无效, 被 SIGKILL 强制结束。 */
	| "killed"
	/** 命令行与勾选时不一致, 未发出任何信号。 */
	| "skipped-changed"
	/** 信号发出了但进程仍在, 或查询与发信号本身失败。 */
	| "failed";

export interface KillReport {
	target: KillTarget;
	outcome: KillOutcome;
	detail?: string;
}

export interface KillDeps {
	run: RunCommand;
	sendSignal: SendSignal;
	/** 注入以便测试用假时钟, 不真的等待。 */
	wait: (ms: number) => Promise<void>;
	platform: NodeJS.Platform;
	killTimeout: number;
}

const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

/**
 * 进程身份查询的三种结果。
 *
 * "不存在"与"查询失败"必须分开: 把超时, 工具缺失或权限不足当成已退出, 会虚报终止成功,
 * 而端口实际上仍被占用。
 */
type CommandRead =
	| { kind: "present"; command: string }
	| { kind: "absent" }
	| { kind: "failed"; detail: string };

/** 读取进程当前的完整命令行; 进程确定不存在时返回 absent, 查询本身失败时返回 failed。 */
async function readCommand(
	pid: number,
	run: RunCommand,
	platform: NodeJS.Platform
): Promise<CommandRead> {
	try {
		let stdout: string;
		if (platform === "win32") {
			const script = `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`;
			const result = await run("powershell.exe", [...POWERSHELL_ARGS, script]);
			stdout = result.stdout;
		} else {
			const result = await run("ps", ["-ww", "-o", "args=", "-p", String(pid)]);
			stdout = result.stdout;
		}
		const command = stdout.trim();
		// `ps -p` 对不存在的 PID 退出非 0 且无输出, PowerShell 查不到时输出空串 —— 两者都归为 absent。
		return command === "" ? { kind: "absent" } : { kind: "present", command };
	} catch (error) {
		return {
			kind: "failed",
			detail: error instanceof Error ? error.message : String(error),
		};
	}
}

/** 存活探测的三种结果。 */
type Probe = { state: "alive" | "dead"; error?: Error };

/**
 * `process.kill(pid, 0)` 不发信号, 只探测存活。
 *
 * `ESRCH` 是确定的不存在; `EPERM` 表示进程存在但无权发信号, 同样算存活; 其余错误无法判定,
 * 按"仍然存活"保守处理并保留原因 —— 只有确认进程不存在时才按已退出处理。
 */
function probeAlive(pid: number, sendSignal: SendSignal): Probe {
	try {
		sendSignal(pid, 0);
		return { state: "alive" };
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		if (code === "ESRCH") return { state: "dead" };
		if (code === "EPERM") return { state: "alive" };
		return {
			state: "alive",
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

/** 等到进程消失或超时; `error` 非空表示探测本身失败, 存活状态不可信。 */
async function waitForExit(
	pid: number,
	deps: Pick<KillDeps, "sendSignal" | "wait" | "killTimeout">
): Promise<Probe> {
	let waited = 0;
	while (waited < deps.killTimeout) {
		const probe = probeAlive(pid, deps.sendSignal);
		if (probe.state === "dead") return probe;
		if (probe.error !== undefined) return probe;
		await deps.wait(POLL_INTERVAL_MS);
		waited += POLL_INTERVAL_MS;
	}
	return probeAlive(pid, deps.sendSignal);
}

async function killOne(target: KillTarget, deps: KillDeps): Promise<KillReport> {
	const firstRead = await readCommand(target.pid, deps.run, deps.platform);

	// 查询本身失败 —— 无法校验身份, 宁可报失败也不盲发信号。
	if (firstRead.kind === "failed") {
		return { target, outcome: "failed", detail: firstRead.detail };
	}

	// 进程已经不在了 —— 目的已达成, 不必再发信号。
	if (firstRead.kind === "absent") return { target, outcome: "terminated" };

	if (firstRead.command !== target.expectedCommand) {
		return { target, outcome: "skipped-changed", detail: firstRead.command };
	}

	try {
		if (deps.platform === "win32") {
			await deps.run("taskkill", ["/PID", String(target.pid)]);
		} else {
			deps.sendSignal(target.pid, "SIGTERM");
		}
	} catch (error) {
		return {
			target,
			outcome: "failed",
			detail: error instanceof Error ? error.message : String(error),
		};
	}

	let probe = await waitForExit(target.pid, deps);
	if (probe.error !== undefined) return { target, outcome: "failed", detail: probe.error.message };
	if (probe.state === "dead") return { target, outcome: "terminated" };

	// 升级 SIGKILL 前重新校验身份: 等待窗口最长有 killTimeout 秒, PID 可能已
	// 被系统复用给别的进程。身份改变或无法读取时停止发送信号。
	const secondRead = await readCommand(target.pid, deps.run, deps.platform);
	if (secondRead.kind === "failed") {
		return { target, outcome: "failed", detail: secondRead.detail };
	}
	if (secondRead.kind === "absent") return { target, outcome: "terminated" };
	if (secondRead.command !== target.expectedCommand) {
		return { target, outcome: "skipped-changed", detail: secondRead.command };
	}

	try {
		if (deps.platform === "win32") {
			await deps.run("taskkill", ["/F", "/PID", String(target.pid)]);
		} else {
			deps.sendSignal(target.pid, "SIGKILL");
		}
	} catch (error) {
		return {
			target,
			outcome: "failed",
			detail: error instanceof Error ? error.message : String(error),
		};
	}

	probe = await waitForExit(target.pid, deps);
	if (probe.error !== undefined) return { target, outcome: "failed", detail: probe.error.message };
	if (probe.state === "dead") return { target, outcome: "killed" };
	return { target, outcome: "failed", detail: "process survived SIGKILL" };
}

/**
 * 逐个终止。
 *
 * 刻意串行而不是并发: 每个目标都要先查命令行再发信号, 并发会让子进程调用数量在批量很大时
 * 突然放大, 而这里的耗时本来就由等待退出主导。
 */
export async function killProcesses(targets: KillTarget[], deps: KillDeps): Promise<KillReport[]> {
	const reports: KillReport[] = [];
	for (const target of targets) reports.push(await killOne(target, deps));
	return reports;
}

export interface KillSummary {
	terminated: number;
	killed: number;
	skipped: number;
	failed: number;
	/** 未能终止或被跳过的条目, 供上层展示明细。 */
	problems: KillReport[];
}

export function summarizeOutcomes(reports: KillReport[]): KillSummary {
	const summary: KillSummary = { terminated: 0, killed: 0, skipped: 0, failed: 0, problems: [] };

	for (const report of reports) {
		switch (report.outcome) {
			case "terminated":
				summary.terminated += 1;
				break;
			case "killed":
				summary.killed += 1;
				break;
			case "skipped-changed":
				summary.skipped += 1;
				summary.problems.push(report);
				break;
			case "failed":
				summary.failed += 1;
				summary.problems.push(report);
				break;
		}
	}

	return summary;
}

/** 真实等待; 测试注入假实现。 */
export const realWait = (ms: number): Promise<void> =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

/** 真实信号发送; 测试注入假实现。 */
export const realSendSignal: SendSignal = (pid, signal) => {
	process.kill(pid, signal);
};
