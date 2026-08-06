import { describe, expect, it } from 'vitest';

import { snap } from './helpers';

describe('createSnapshot', () => {
  it('按 LF 切分行, end 不含换行符', () => {
    const snapshot = snap('a\nbb\nccc');
    expect(snapshot.lineCount).toBe(3);
    expect(snapshot.lineAt(0)).toEqual({ index: 0, start: 0, end: 1, text: 'a' });
    expect(snapshot.lineAt(1)).toEqual({ index: 1, start: 2, end: 4, text: 'bb' });
    expect(snapshot.lineAt(2)).toEqual({ index: 2, start: 5, end: 8, text: 'ccc' });
  });

  it('CRLF 的 \\r 不算进行内容', () => {
    const snapshot = snap('a\r\nb');
    expect(snapshot.lineAt(0).text).toBe('a');
    expect(snapshot.lineAt(0).end).toBe(1);
    expect(snapshot.lineAt(1).text).toBe('b');
  });

  it('同一文档混用 LF 与 CRLF 时逐行按实际字符切分', () => {
    const snapshot = snap('a\r\nb\nc\r\n');
    expect(snapshot.lineCount).toBe(4);
    expect(snapshot.lineAt(0).text).toBe('a');
    expect(snapshot.lineAt(1).text).toBe('b');
    expect(snapshot.lineAt(2).text).toBe('c');
    expect(snapshot.lineAt(3).text).toBe('');
  });

  it('末尾换行会产生一个空的末行', () => {
    const snapshot = snap('a\n');
    expect(snapshot.lineCount).toBe(2);
    expect(snapshot.lineAt(1).text).toBe('');
  });

  it('lineAt 的越界索引被夹到有效范围', () => {
    const snapshot = snap('a\nb');
    expect(snapshot.lineAt(-5).index).toBe(0);
    expect(snapshot.lineAt(99).index).toBe(1);
  });

  it('lineOf 在行首与行尾都落在同一行', () => {
    const snapshot = snap('abc\ndef');
    expect(snapshot.lineOf(0)).toBe(0);
    expect(snapshot.lineOf(3)).toBe(0);
    expect(snapshot.lineOf(4)).toBe(1);
    expect(snapshot.lineOf(7)).toBe(1);
  });

  it('eol 与实际换行字符无关, 只用于新插入的行', () => {
    const snapshot = snap('a\nb', 'typescript', '\r\n');
    expect(snapshot.eol).toBe('\r\n');
    expect(snapshot.lineAt(0).text).toBe('a');
  });
});
