import { createHash } from 'node:crypto';

import type { ApplyPlan, ChecksumChange } from './types';

/**
 * 校验和计算与命名规则, 全部是纯函数。
 *
 * 这里不碰磁盘也不碰 `vscode`, 因此算法本身可以用固定向量钉住, 而不必依赖某个真实安装。
 */

/** 备份文件名前缀; 与上游插件的 `product.json.orig.` 刻意不同, 两者互不干扰。 */
const BACKUP_PREFIX = 'product.json.ect-orig.';

/**
 * 编辑器自身的校验方式: sha256 摘要的 base64, 去掉尾部填充。
 *
 * 已用本机 VS Code 1.132.0 的 `product.json` 逐条比对确认: 10 条登记值与本函数的输出完全一致。
 */
export function computeChecksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '');
}

/**
 * 算出要写回 `product.json` 的内容。
 *
 * `digestOf` 返回 `undefined` 表示该文件在磁盘上不存在 —— 这种条目被记入 `missing` 并跳过,
 * 而不是让整次修复失败: 编辑器版本与 `checksums` 清单不完全对应时, 其余条目仍然应该被修好。
 *
 * `productText` 不是合法 JSON 时直接抛出, 由调用方归类为读取失败。
 */
export function planApply(
  productText: string,
  digestOf: (relativePath: string) => string | undefined,
): ApplyPlan {
  const product = JSON.parse(productText) as { checksums?: Record<string, string> };
  const checksums = product.checksums;

  if (checksums === undefined || Object.keys(checksums).length === 0) {
    return { kind: 'no-checksums', changes: [], missing: [], nextText: null };
  }

  const changes: ChecksumChange[] = [];
  const missing: string[] = [];

  for (const [path, current] of Object.entries(checksums)) {
    const next = digestOf(path);
    if (next === undefined) {
      missing.push(path);
      continue;
    }
    if (next !== current) changes.push({ path, from: current, to: next });
  }

  if (changes.length === 0) return { kind: 'unchanged', changes, missing, nextText: null };

  for (const change of changes) checksums[change.path] = change.to;

  // tab 缩进且不追加尾部换行: 与 `product.json` 既有形态一致。JSON 往返会把出厂文件里
  // 写成一行的短数组展开成多行 (体积因此变大约 4KB), 数据等价, 而出厂原文的逐字节副本
  // 由备份文件保留 —— 这也是备份必须复制原始字节而不是重新序列化的原因。
  return { kind: 'changed', changes, missing, nextText: JSON.stringify(product, null, '\t') };
}

/** 当前编辑器版本对应的备份文件名; 版本号里的非法字符换成 `_` 以保证是个合法文件名。 */
export function backupName(version: string): string {
  return `${BACKUP_PREFIX}${version.replace(/[^\w.-]/g, '_')}`;
}

/**
 * 目录条目中属于本插件, 但不属于当前版本的备份。
 *
 * 判据是**整个文件名**不等于当前版本的备份名。拿版本段去比 `backupName()` 是个陷阱:
 * 那个比较永远成立, 会把当前版本的备份也判成陈旧并删掉, 直接毁掉唯一的还原来源。
 */
export function staleBackups(entries: string[], version: string): string[] {
  const current = backupName(version);
  return entries.filter(
    (entry) =>
      entry.startsWith(BACKUP_PREFIX) && entry.length > BACKUP_PREFIX.length && entry !== current,
  );
}

const quote = (path: string): string => `"${path}"`;

/** 复制一个文件的等价命令; 只用于展示与复制, 本插件从不执行它。 */
function copyCommand(platform: string, from: string, to: string): string {
  return platform === 'win32'
    ? `copy /Y ${quote(from)} ${quote(to)}`
    : `sudo cp ${quote(from)} ${quote(to)}`;
}

/**
 * 权限不足时, 用户自己执行即可完成修复的命令。
 *
 * `backupToCreate` 为 `undefined` 表示备份已经存在, 此时只需要写回 `product.json`。
 */
export function manualApplyCommand(
  platform: string,
  paths: { product: string; staged: string; backupToCreate?: string },
): string {
  const write = copyCommand(platform, paths.staged, paths.product);
  if (paths.backupToCreate === undefined) return write;
  return `${copyCommand(platform, paths.product, paths.backupToCreate)} && ${write}`;
}

/** 权限不足时, 用户自己执行即可完成还原的命令。 */
export function manualRestoreCommand(
  platform: string,
  paths: { product: string; backup: string },
): string {
  return copyCommand(platform, paths.backup, paths.product);
}
