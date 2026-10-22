import type { ExtensionState, RunSeam, SkipReason, Step, StepResult, Summary } from "./types";

/**
 * 清理命令的编排; 不 import `vscode`, 命令执行与扩展状态走注入的 `RunSeam`。
 *
 * 规则:
 * - 单条出错不中断后续条目: "命令不存在"记为跳过, 其余异常记为失败;
 * - 不弹框的条目先执行, 弹框的放最后, 免得用户在中途被一个框卡住而后面的条目都在等;
 * - 不弹框的条目设单条超时, 超时记为未完成并继续; 弹框的不设, 用户可能正在看框。
 *
 * 多数命令没有返回值, 用户在确认框里点取消也无从得知, 所以结果只区分"执行了"而不是"清掉了"。
 */

/** 稳定排序: 不弹框在前, 同组内保持清单顺序。 */
export function orderSteps(steps: readonly Step[]): Step[] {
	return [...steps.filter(step => !step.prompts), ...steps.filter(step => step.prompts)];
}

/** 执行前就能判定的跳过; 返回 undefined 表示应当执行。 */
export function skipReason(step: Step, state: ExtensionState | undefined): SkipReason | undefined {
	if (step.extension === undefined) return undefined;
	if (state === "missing") return "not-installed";
	if (step.memoryOnly && state === "inactive") return "inactive";
	return undefined;
}

/** `executeCommand` 对未注册命令抛出的错误形如 `command 'x' not found`。 */
export function isCommandNotFound(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /command '[^']*' not found/.test(message);
}

function firstLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split("\n")[0];
}

const TIMED_OUT = Symbol("timeout");

async function withTimeout(
	task: Promise<void>,
	timeoutMs: number
): Promise<void | typeof TIMED_OUT> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof TIMED_OUT>(resolve => {
		timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
	});
	try {
		return await Promise.race([task, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

async function runStep(seam: RunSeam, step: Step): Promise<StepResult> {
	const reason = skipReason(
		step,
		step.extension === undefined ? undefined : seam.extensionState(step.extension)
	);
	if (reason !== undefined) return { step, status: "skipped", reason };

	try {
		const task = seam.execute(step);
		if (step.prompts) {
			await task;
		} else if ((await withTimeout(task, seam.timeoutMs)) === TIMED_OUT) {
			// 超时的命令仍在后台跑; 之后它再失败也不该冒成未处理的 rejection。
			task.catch(() => undefined);
			return { step, status: "timeout" };
		}
		return { step, status: "done" };
	} catch (error) {
		if (isCommandNotFound(error)) return { step, status: "skipped", reason: "not-found" };
		return { step, status: "failed", detail: firstLine(error) };
	}
}

export async function runSteps(seam: RunSeam, steps: readonly Step[]): Promise<Summary> {
	const ordered = orderSteps(steps);
	const summary: Summary = { done: 0, skipped: 0, failed: 0, timeout: 0, results: [] };
	for (const [index, step] of ordered.entries()) {
		seam.onStep?.(index + 1, ordered.length, step);
		const result = await runStep(seam, step);
		summary[result.status] += 1;
		summary.results.push(result);
	}
	return summary;
}
