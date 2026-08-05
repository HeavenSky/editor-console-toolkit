/**
 * 把可见文本转义成可以直接嵌进本语言字符串字面量的形式(不含外层引号).
 * prefix 中的控制字符已在读取配置时剥离, 这里只处理会破坏字面量或触发插值的字符.
 *
 * `extra` 用于插值语言: Kotlin/Dart 需要 `$`, Ruby/Elixir 需要 `#`.
 */
export function escapeLiteral(raw: string, quote: string, extra: readonly string[] = []): string {
  const needsBackslash = new Set<string>(['\\', quote, ...extra]);
  let out = '';
  for (const ch of raw) {
    out += needsBackslash.has(ch) ? `\\${ch}` : ch;
  }
  return out;
}

/** C# 与 Rust 的格式串里 `{` `}` 用双写转义, 不是反斜杠. */
export function doubleBraces(raw: string): string {
  return raw.replace(/[{}]/g, (match) => match + match);
}
