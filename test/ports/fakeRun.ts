import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RunCommand } from '../../src/ports/types';

const FIXTURES = join(__dirname, '..', 'fixtures', 'ports');

/** 读取固化的真实命令输出样例。 */
export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

export interface RecordedCall {
  file: string;
  args: string[];
}

/**
 * 子进程接缝的测试替身。
 *
 * `responses` 按"匹配函数 → 输出"给出; 没有任何匹配项时抛错, 因为那意味着被测代码发出了
 * 一条没被断言过的命令 —— 静默返回空字符串会把这种偏差藏起来。
 */
export function fakeRun(
  responses: Array<{ match: (file: string, args: string[]) => boolean; stdout?: string; throws?: string }>
): { run: RunCommand; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const run: RunCommand = async (file, args) => {
    calls.push({ file, args });
    const response = responses.find((candidate) => candidate.match(file, args));
    if (!response) throw new Error(`未预期的命令: ${file} ${args.join(' ')}`);
    if (response.throws) throw new Error(response.throws);
    return { stdout: response.stdout ?? '', stderr: '', code: 0 };
  };

  return { run, calls };
}
