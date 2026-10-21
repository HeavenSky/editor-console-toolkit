import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FsSeam } from "./types";

/**
 * 本功能域唯一的磁盘出口。
 *
 * 错误一律原样抛出 —— 编排层要靠 `error.code` 区分"没权限"和"真的坏了", 包一层就把这个
 * 信息丢了。
 */
export const realFs: FsSeam = {
	exists: path => existsSync(path),
	readText: path => readFileSync(path, "utf8"),
	readBytes: path => readFileSync(path),
	writeText: (path, text) => {
		writeFileSync(path, text, "utf8");
	},
	copy: (from, to) => {
		copyFileSync(from, to);
	},
	rename: (from, to) => {
		renameSync(from, to);
	},
	remove: path => {
		unlinkSync(path);
	},
	list: dir => readdirSync(dir),
	ensureDir: path => {
		mkdirSync(path, { recursive: true });
	},
};

/**
 * 权限不足时的暂存目录。
 *
 * 走到这条路径就说明安装目录不可写, 所以暂存必须落在用户一定能写的地方; 路径固定而不是
 * 随机, 这样提示里给出的手动命令是可复述, 可复查的。
 */
export const stagingDir = join(tmpdir(), "editor-console-toolkit");
