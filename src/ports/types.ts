/**
 * 端口与进程管理的共享数据契约。
 *
 * 这些类型不 import `vscode`, 所以扫描, 过滤与终止的决策逻辑全部可以在 vitest 里断言,
 * 只有视图与命令层才碰宿主 API。
 */

/** 一个监听端点。IPv4 与 IPv6 的同协议同端口在聚合阶段已合并成一条。 */
export interface Listener {
  protocol: 'TCP' | 'UDP';
  /** 归一化后的监听地址; `*` 归一为 `0.0.0.0`, IPv6 去掉方括号。 */
  address: string;
  port: number;
}

/** 进程归属; `workspace` 表示其工作目录落在当前打开的某个 workspace folder 之下。 */
export type Origin = 'workspace' | 'other' | 'system';

/** 不可终止的原因; 三者互斥, 优先级见 `annotateKillability`。 */
export type BlockedReason = 'unknown-pid' | 'protected-ancestor' | 'other-user';

/** 一个监听着至少一个端口的进程。 */
export interface ProcessEntry {
  /** Linux 非 root 时 `ss` 拿不到归属, 此时为 null。 */
  pid: number | null;
  ppid: number | null;
  user: string;
  /** 完整进程名, 不截断。 */
  name: string;
  /** 完整命令行。 */
  command: string;
  cwd: string | null;
  /** locale 无关的运行时长, 形如 `03-19:03:13`; 只作展示, 不参与计算。 */
  etime: string;
  listeners: Listener[];
  origin: Origin;
  killable: boolean;
  blockedReason?: BlockedReason;
}

export interface ScanOptions {
  includeUdp: boolean;
}

/** 扫描结果; `error` 非空时 `entries` 为空, 由视图渲染成单条错误项。 */
export interface ScanResult {
  entries: ProcessEntry[];
  error?: string;
}

/**
 * 子进程调用接缝。
 *
 * 传 argv 数组而不是命令字符串, 因此不经 shell, PID 之类的动态值不可能被解释成命令。
 */
export type RunCommand = (
  file: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string; code: number }>;

/** 信号接缝; `signal` 为 0 时只探测存活, 不实际发信号。 */
export type SendSignal = (pid: number, signal: NodeJS.Signals | 0) => void;
