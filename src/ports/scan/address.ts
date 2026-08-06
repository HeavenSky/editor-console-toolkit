import type { Listener } from '../types';

/**
 * 把 `地址:端口` 拆成归一化的地址与端口。
 *
 * 各平台的写法都不一样, 集中在这里处理: `*:8080`, `0.0.0.0:80`, `[::]:5000`, `[::1]:3000`,
 * `127.0.0.1:59093`。端口一律取最后一个冒号之后的部分, 否则 IPv6 里的冒号会把解析带偏。
 */
export function parseEndpoint(raw: string): { address: string; port: number } | null {
  const separator = raw.lastIndexOf(':');
  if (separator === -1) return null;

  const port = Number(raw.slice(separator + 1));
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null;

  let address = raw.slice(0, separator);
  if (address === '*') address = '0.0.0.0';
  else if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);

  return { address, port };
}

/**
 * 合并同一进程内重复的监听项。
 *
 * IPv4 与 IPv6 会各占一行 (`lsof` 下同一个端口出现两次), 对用户是同一件事, 因此按
 * `protocol + port` 合并; 地址取第一个非通配地址, 没有则保留通配地址。
 */
export function mergeListeners(listeners: Listener[]): Listener[] {
  const byKey = new Map<string, Listener>();

  for (const listener of listeners) {
    const key = `${listener.protocol}:${listener.port}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...listener });
      continue;
    }
    const wildcard = (address: string) => address === '0.0.0.0' || address === '::';
    if (wildcard(existing.address) && !wildcard(listener.address)) {
      existing.address = listener.address;
    }
  }

  return [...byKey.values()].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));
}
