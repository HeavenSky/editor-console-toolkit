import type { DocumentSnapshot, EndOfLine, LineInfo } from './types';

/**
 * 从纯文本构建不可变快照. 全部命令都基于编辑器内存文本工作, 不读磁盘,
 * 因此未保存的缓冲区也能得到正确结果.
 *
 * 行尾按实际字符切分, 与 eol 参数无关: 文档可能混用 LF 与 CRLF, 而 eol 只用于决定新插入行的换行符.
 */
export function createSnapshot(text: string, languageId: string, eol: EndOfLine): DocumentSnapshot {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lineStarts.push(i + 1);
    }
  }

  const lineCount = lineStarts.length;

  const lineAt = (index: number): LineInfo => {
    const clamped = index < 0 ? 0 : index >= lineCount ? lineCount - 1 : index;
    const start = lineStarts[clamped];
    const nextStart = clamped + 1 < lineCount ? lineStarts[clamped + 1] : text.length;
    let end = nextStart;
    if (end > start && text.charCodeAt(end - 1) === 10) {
      end--;
    }
    if (end > start && text.charCodeAt(end - 1) === 13) {
      end--;
    }
    return { index: clamped, start, end, text: text.slice(start, end) };
  };

  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineCount - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  };

  return { text, languageId, eol, lineCount, lineAt, lineOf };
}
