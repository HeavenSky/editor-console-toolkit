import { execFile } from 'node:child_process';

import type { RunCommand } from '../types';

/**
 * 全插件唯一的子进程出口。
 *
 * 两个刻意的行为:
 * - 用 `execFile` 传 argv 数组, 不经 shell, 所以拼进参数的 PID 不可能被当成命令执行;
 * - **退出码非 0 不算失败**。`lsof` 在"没有匹配项"时就返回 1, 按退出码判定会把空结果
 *   误当成错误。只有"什么都没输出, 却往 stderr 写了东西"才是真失败。
 */
const TIMEOUT_MS = 5000;

/** 输出上限, 防止异常情况下把整个进程列表读进内存。 */
const MAX_BUFFER = 8 * 1024 * 1024;

export const runCommand: RunCommand = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const code = error && typeof error.code === 'number' ? error.code : 0;

        if (stdout === '' && stderr !== '') {
          reject(new Error(`${file} 执行失败: ${stderr.trim().split('\n')[0]}`));
          return;
        }
        // 超时或找不到可执行文件时 stdout 与 stderr 都可能是空的, 此时只能靠 error 判定。
        if (stdout === '' && error && typeof error.code !== 'number') {
          reject(new Error(`${file} 执行失败: ${error.message}`));
          return;
        }

        resolve({ stdout, stderr, code });
      }
    );
  });
