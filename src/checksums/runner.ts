import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import {
	backupName,
	computeChecksum,
	manualApplyCommand,
	manualRestoreCommand,
	planApply,
	staleBackups,
} from "./core";
import type { ApplyPlan, FsSeam, Outcome, RunContext } from "./types";

/**
 * 修复与还原的编排; 不 import `vscode`, 磁盘访问一律走注入的 `FsSeam`。
 *
 * 三条顺序上的硬要求, 都是为了"任何一步失败都不会让编辑器起不来":
 * - 备份是**复制**而不是重命名, 所以 `product.json` 在整个过程中始终在位;
 * - 写盘先写同目录临时文件再 `rename` 覆盖, 因此不存在被截断的 `product.json`;
 * - 还原先把备份内容写回, **成功之后**才删备份, 顺序反过来中途失败就两份都没了。
 */

/** 写盘用的同目录临时文件; 同目录才能保证 rename 是原子替换而不是跨设备复制。 */
const TEMP_NAME = "product.json.ect-tmp";

/** 这三个 errno 表示"没权限", 此时不提权, 改为把命令交回用户。 */
const PERMISSION_CODES = new Set(["EACCES", "EPERM", "EROFS"]);

interface Paths {
	product: string;
	backup: string;
	temp: string;
	staged: string;
}

/**
 * 暂存目录里按安装隔离的子目录名。
 *
 * 多个编辑器安装共用同一个暂存根目录, 不隔离就会互相复写: 安装 A 暂存过一次后, 安装 B 的
 * 暂存会覆盖同一个文件, 而 A 先前提示的手动命令引用的还是这个路径, 照着执行会把 B 的
 * `product.json` 写进 A。用安装路径的摘要而不是路径本身做目录名, 避免路径里的非法字符与
 * 过长路径; 同一安装复写自己的暂存是安全的 —— 内容同源, 且命令总是本次提示的那条。
 */
function installKey(appRoot: string): string {
	return createHash("sha1").update(appRoot).digest("hex").slice(0, 12);
}

function resolvePaths(ctx: RunContext): Paths {
	return {
		product: join(ctx.appRoot, "product.json"),
		backup: join(ctx.appRoot, backupName(ctx.version)),
		temp: join(ctx.appRoot, TEMP_NAME),
		staged: join(
			ctx.stagingDir,
			installKey(ctx.appRoot),
			// 版本也在隔离内: 编辑器升级后同一安装的旧暂存不该再被手动命令引用。
			ctx.version.replace(/[^\w.-]/g, "_"),
			"product.json"
		),
	};
}

function isPermissionError(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === "string" && PERMISSION_CODES.has(code);
}

function firstLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split("\n")[0];
}

/** 临时文件是内部产物, 删不掉也不该让命令失败; 留下它只会在下次被覆盖。 */
function discardTemp(fs: FsSeam, temp: string): void {
	try {
		if (fs.exists(temp)) fs.remove(temp);
	} catch {
		// 没权限删就算了: 这条路径本来就是因为没权限才走到的。
	}
}

/**
 * 清掉本插件为其它编辑器版本留下的备份。
 *
 * 只在命令执行时做, 不在激活时做, 也从不提权 —— 上游正是在激活时提权清理, 结果每次启动
 * 都可能弹一次密码框。清理失败完全不影响主功能, 因此异常只体现在计数上。
 */
function cleanupStaleBackups(ctx: RunContext): number {
	let cleaned = 0;
	try {
		for (const name of staleBackups(ctx.fs.list(ctx.appRoot), ctx.version)) {
			try {
				ctx.fs.remove(join(ctx.appRoot, name));
				cleaned += 1;
			} catch {
				// 陈旧备份留在盘上不影响任何功能。
			}
		}
	} catch {
		// 目录读不出来就跳过清理。
	}
	return cleaned;
}

/** 成功类结局才顺手清理陈旧备份; 失败结局跳过, 不在已经出错的目录里追加删除尝试。 */
function withCleanup(ctx: RunContext, outcome: Outcome): Outcome {
	return { ...outcome, cleaned: cleanupStaleBackups(ctx) };
}

/** 把待写内容暂存到用户可写的位置, 并给出等价的手动命令。 */
function stageForManualRun(
	ctx: RunContext,
	paths: Paths,
	text: string,
	missing: number,
	backupExists: boolean
): Outcome {
	try {
		ctx.fs.ensureDir(dirname(paths.staged));
		ctx.fs.writeText(paths.staged, text);
	} catch (error) {
		return { kind: "write-failed", changed: 0, missing, cleaned: 0, detail: firstLine(error) };
	}
	return {
		kind: "permission-denied",
		changed: 0,
		missing,
		cleaned: 0,
		stagedPath: paths.staged,
		command: manualApplyCommand(ctx.platform, {
			product: paths.product,
			staged: paths.staged,
			backupToCreate: backupExists ? undefined : paths.backup,
		}),
	};
}

function digestOf(ctx: RunContext, relativePath: string): string | undefined {
	const file = join(ctx.appRoot, "out", ...relativePath.split("/"));
	if (!ctx.fs.exists(file)) return undefined;
	return computeChecksum(ctx.fs.readBytes(file));
}

export function applyChecksums(ctx: RunContext): Outcome {
	const paths = resolvePaths(ctx);

	let plan: ApplyPlan;
	try {
		plan = planApply(ctx.fs.readText(paths.product), relative => digestOf(ctx, relative));
	} catch (error) {
		return {
			kind: "read-failed",
			changed: 0,
			missing: 0,
			cleaned: 0,
			detail: firstLine(error),
		};
	}

	const missing = plan.missing.length;
	if (plan.kind === "no-checksums") {
		return withCleanup(ctx, { kind: "no-checksums", changed: 0, missing, cleaned: 0 });
	}
	if (plan.nextText === null) {
		return withCleanup(ctx, { kind: "unchanged", changed: 0, missing, cleaned: 0 });
	}

	const backupExists = ctx.fs.exists(paths.backup);
	try {
		if (!backupExists) ctx.fs.copy(paths.product, paths.backup);
		ctx.fs.writeText(paths.temp, plan.nextText);
		ctx.fs.rename(paths.temp, paths.product);
	} catch (error) {
		discardTemp(ctx.fs, paths.temp);
		if (!isPermissionError(error)) {
			return {
				kind: "write-failed",
				changed: 0,
				missing,
				cleaned: 0,
				detail: firstLine(error),
			};
		}
		return stageForManualRun(ctx, paths, plan.nextText, missing, backupExists);
	}

	return withCleanup(ctx, { kind: "applied", changed: plan.changes.length, missing, cleaned: 0 });
}

export function restoreChecksums(ctx: RunContext): Outcome {
	const paths = resolvePaths(ctx);

	if (!ctx.fs.exists(paths.backup)) {
		return withCleanup(ctx, { kind: "no-backup", changed: 0, missing: 0, cleaned: 0 });
	}

	let text: string;
	try {
		text = ctx.fs.readText(paths.backup);
	} catch (error) {
		return {
			kind: "read-failed",
			changed: 0,
			missing: 0,
			cleaned: 0,
			detail: firstLine(error),
		};
	}

	try {
		ctx.fs.writeText(paths.temp, text);
		ctx.fs.rename(paths.temp, paths.product);
	} catch (error) {
		discardTemp(ctx.fs, paths.temp);
		if (!isPermissionError(error)) {
			return {
				kind: "write-failed",
				changed: 0,
				missing: 0,
				cleaned: 0,
				detail: firstLine(error),
			};
		}
		// 还原不需要暂存文件: 源就是磁盘上那份备份, 手动命令直接引用它。
		return {
			kind: "permission-denied",
			changed: 0,
			missing: 0,
			cleaned: 0,
			command: manualRestoreCommand(ctx.platform, {
				product: paths.product,
				backup: paths.backup,
			}),
		};
	}

	try {
		ctx.fs.remove(paths.backup);
	} catch {
		// 备份还在不影响已经还原成功的结果; 下次 apply 会因为它存在而不再重建。
	}

	return withCleanup(ctx, { kind: "restored", changed: 0, missing: 0, cleaned: 0 });
}
