/**
 * 所有权标记. 判定"某行是本插件生成的日志"的唯一依据.
 *
 * 标记不含 prefix, 因此用户改了 prefix 之后仍能移除此前插入的日志;
 * 也不含适配器 id 与哈希, 定位精度由"日志必须位于目标锚点的紧邻下一行"这一位置约束提供.
 */
const MARKER_TEXT = 'ect:v1';

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 追加到日志行尾的完整后缀, 例如 ` // ect:v1`. */
export function buildMarkerSuffix(commentPrefix: string): string {
  return ` ${commentPrefix} ${MARKER_TEXT}`;
}

export function markerPatternFor(commentPrefix: string): RegExp {
  return new RegExp(`\\s${escapeRegExp(commentPrefix)}\\s*${MARKER_TEXT}\\s*$`);
}

export function isLogLine(lineText: string, pattern: RegExp): boolean {
  return pattern.test(lineText);
}

/** 去掉行尾标记与两端空白, 得到可与 renderLog 结果直接比较的正文. */
export function stripMarker(lineText: string, pattern: RegExp): string {
  return lineText.replace(pattern, '').trim();
}
