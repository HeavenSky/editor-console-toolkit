import { unsupported } from './types';
import type { DocumentSnapshot, ExpressionTarget, SelectionLike, Unsupported } from './types';

const BASE_WORD = /[A-Za-z0-9_]/;

function isWordChar(ch: string, extra: string): boolean {
  return BASE_WORD.test(ch) || extra.includes(ch);
}

function toTarget(snapshot: DocumentSnapshot, start: number, end: number): ExpressionTarget {
  const expression = snapshot.text.slice(start, end);
  return {
    kind: 'target',
    expression,
    label: expression.replace(/\s+/g, ' '),
    sourceRange: { start, end },
    sourceLine: snapshot.lineOf(start)
  };
}

/**
 * 解析一个选区对应的日志目标.
 *
 * - 显式非空选择: 必须落在同一行, 两端 trim 后作为表达式原样使用.
 * - 空选择: 以光标为中心按标识符字符集向两侧扩展, 再向左吸收连续的 `.ident` 属性链.
 *   只向左吸收, 因此光标停在 `user.name` 的 `user` 上得到 `user`, 停在 `name` 上得到 `user.name`.
 */
export function resolveSelection(
  snapshot: DocumentSnapshot,
  selection: SelectionLike,
  identifierExtra: string
): ExpressionTarget | Unsupported {
  const from = Math.min(selection.anchor, selection.active);
  const to = Math.max(selection.anchor, selection.active);

  if (from !== to) {
    if (snapshot.lineOf(from) !== snapshot.lineOf(to)) {
      return unsupported('multiline-selection');
    }
    let start = from;
    let end = to;
    while (start < end && /\s/.test(snapshot.text[start])) {
      start++;
    }
    while (end > start && /\s/.test(snapshot.text[end - 1])) {
      end--;
    }
    return start === end ? unsupported('empty-target') : toTarget(snapshot, start, end);
  }

  const line = snapshot.lineAt(snapshot.lineOf(from));
  let start = from;
  let end = from;
  while (start > line.start && isWordChar(snapshot.text[start - 1], identifierExtra)) {
    start--;
  }
  while (end < line.end && isWordChar(snapshot.text[end], identifierExtra)) {
    end++;
  }
  if (start === end) {
    return unsupported('empty-target');
  }

  // 向左吸收 `.ident` 链, 例如把 `name` 扩展成 `user.profile.name`.
  while (start - 1 > line.start && snapshot.text[start - 1] === '.') {
    let probe = start - 1;
    while (probe > line.start && isWordChar(snapshot.text[probe - 1], identifierExtra)) {
      probe--;
    }
    if (probe === start - 1) {
      break;
    }
    start = probe;
  }

  return toTarget(snapshot, start, end);
}
