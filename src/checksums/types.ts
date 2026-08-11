/**
 * checksums 功能域的公共契约。
 *
 * 全部磁盘访问走 `FsSeam` 而不是直接 import `node:fs`: 这个功能域唯一的写入目标是编辑器
 * 自己的安装目录, 在真机上复现"权限不足"与"写到一半失败"既不安全也不可重复, 因此把接缝
 * 提出来, 让编排层可以在内存里被完整测试。
 */

/** `product.json` 里一条校验和的变化; `path` 是相对 `<appRoot>/out` 的 POSIX 路径。 */
export interface ChecksumChange {
  path: string;
  from: string;
  to: string;
}

export interface ApplyPlan {
  kind: 'no-checksums' | 'unchanged' | 'changed';
  changes: ChecksumChange[];
  /** 登记在 `checksums` 里但磁盘上不存在的文件; 它们被跳过而不是让整次修复失败。 */
  missing: string[];
  /** 仅 `kind === 'changed'` 时为待写入的全文, 其余情况为 `null`。 */
  nextText: string | null;
}

export interface FsSeam {
  exists(path: string): boolean;
  readText(path: string): string;
  readBytes(path: string): Uint8Array;
  writeText(path: string, text: string): void;
  copy(from: string, to: string): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
  list(dir: string): string[];
  ensureDir(path: string): void;
}

export type OutcomeKind =
  | 'no-checksums'
  | 'unchanged'
  | 'applied'
  | 'restored'
  | 'no-backup'
  | 'read-failed'
  | 'permission-denied'
  | 'write-failed';

export interface Outcome {
  kind: OutcomeKind;
  /** 写回的校验和条数。 */
  changed: number;
  /** 被跳过的缺失文件数。 */
  missing: number;
  /** 清理掉的陈旧备份数。 */
  cleaned: number;
  /** `read-failed` 与 `write-failed` 的错误首行。 */
  detail?: string;
  /** `permission-denied` 且有待写内容时的暂存路径; restore 没有暂存文件, 因此为 undefined。 */
  stagedPath?: string;
  /** `permission-denied` 时交给用户自己执行的等价命令。 */
  command?: string;
}

export interface RunContext {
  fs: FsSeam;
  /** `vscode.env.appRoot`。 */
  appRoot: string;
  /** `vscode.version`, 用于给备份文件命名。 */
  version: string;
  /** `process.platform`, 只影响手动命令的形态。 */
  platform: string;
  /** 权限不足时的暂存目录; 必须是用户可写的位置。 */
  stagingDir: string;
}
