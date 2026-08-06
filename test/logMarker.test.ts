import { describe, expect, it } from 'vitest';

import { buildMarkerSuffix, isLogLine, markerPatternFor, stripMarker } from '../src/core/logMarker';

describe('logMarker', () => {
  it('后缀由注释符与固定标记拼成', () => {
    expect(buildMarkerSuffix('//')).toBe(' // ect:v1');
    expect(buildMarkerSuffix('#')).toBe(' # ect:v1');
  });

  it('识别带标记的行', () => {
    const pattern = markerPatternFor('//');
    expect(isLogLine("console.log('a:', a); // ect:v1", pattern)).toBe(true);
    expect(isLogLine("console.log('a:', a);", pattern)).toBe(false);
  });

  it('注释符里的正则元字符被转义 (Lua 的 --)', () => {
    const pattern = markerPatternFor('--');
    expect(isLogLine('print("a:", a) -- ect:v1', pattern)).toBe(true);
    // 若 `-` 未被转义, `--` 会被当成字符区间之类的写法而误匹配其它注释符。
    expect(isLogLine('print("a:", a) // ect:v1', pattern)).toBe(false);
  });

  it('标记必须在行尾', () => {
    const pattern = markerPatternFor('//');
    expect(isLogLine('// ect:v1 trailing', pattern)).toBe(false);
    expect(isLogLine('code; // ect:v1   ', pattern)).toBe(true);
  });

  it('标记前必须有空白, 避免误伤内容里出现的同名文本', () => {
    const pattern = markerPatternFor('//');
    expect(isLogLine('x=1;// ect:v1', pattern)).toBe(false);
  });

  it('stripMarker 去掉标记与两端空白, 结果可与 renderLog 直接比较', () => {
    const pattern = markerPatternFor('//');
    expect(stripMarker("  console.log('a:', a); // ect:v1", pattern)).toBe("console.log('a:', a);");
  });

  it('prefix 变了仍能识别此前插入的日志', () => {
    const pattern = markerPatternFor('//');
    expect(isLogLine("console.log('OLD a:', a); // ect:v1", pattern)).toBe(true);
    expect(isLogLine("console.log('NEW a:', a); // ect:v1", pattern)).toBe(true);
  });
});
