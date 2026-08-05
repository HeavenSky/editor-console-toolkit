import type { LanguageAdapter } from '../languages/languageAdapter';
import { buildMarkerSuffix, isLogLine, stripMarker } from './logMarker';
import type {
  DocumentSnapshot,
  EditPlan,
  InsertionAnchor,
  OffsetRange,
  PlannedEdit,
  SelectionLike,
  UnsupportedCode
} from './types';

export type CommandMode = 'insert' | 'toggle';

/** 删除整行时连同它的换行符一起去掉; 末行没有后继换行, 就吃掉它前面的那个. */
function deleteRangeForLine(snapshot: DocumentSnapshot, index: number): OffsetRange {
  const line = snapshot.lineAt(index);
  if (index + 1 < snapshot.lineCount) {
    return { start: line.start, end: snapshot.lineAt(index + 1).start };
  }
  if (index > 0) {
    return { start: snapshot.lineAt(index - 1).end, end: line.end };
  }
  return { start: line.start, end: line.end };
}

function overlaps(a: OffsetRange, b: OffsetRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * 为一次命令生成编辑计划.
 *
 * Toggle: 光标在日志行上直接删该行; 否则解析目标, 锚点下一行是日志就删, 不是就插.
 * Insert: 解析目标后, 锚点下一行已有内容完全相同的日志则跳过, 否则插入.
 *
 * 全部 offset 都基于同一份原文档快照, 由调用方在一次 TextEditor.edit 中提交.
 */
export function planEdits(
  snapshot: DocumentSnapshot,
  adapter: LanguageAdapter,
  prefix: string,
  selections: readonly SelectionLike[],
  mode: CommandMode
): EditPlan {
  const pattern = adapter.markerPattern();
  const markerSuffix = buildMarkerSuffix(adapter.commentPrefix);
  const edits: PlannedEdit[] = [];
  const deletedLines = new Set<number>();
  const usedAnchors = new Set<number>();
  const deletedRanges: OffsetRange[] = [];
  let firstReason: UnsupportedCode | null = null;

  const noteReason = (code: UnsupportedCode): void => {
    firstReason ??= code;
  };

  const pushDelete = (lineIndex: number): void => {
    if (deletedLines.has(lineIndex)) {
      return;
    }
    const range = deleteRangeForLine(snapshot, lineIndex);
    if (deletedRanges.some((existing) => overlaps(existing, range))) {
      return;
    }
    deletedLines.add(lineIndex);
    deletedRanges.push(range);
    edits.push({ kind: 'delete', range });
  };

  const nextLineIfLog = (anchor: InsertionAnchor): number | null => {
    const next = anchor.line + 1;
    if (next >= snapshot.lineCount) {
      return null;
    }
    return isLogLine(snapshot.lineAt(next).text, pattern) ? next : null;
  };

  for (const selection of selections) {
    if (mode === 'toggle') {
      const cursorLine = snapshot.lineOf(selection.active);
      if (isLogLine(snapshot.lineAt(cursorLine).text, pattern)) {
        pushDelete(cursorLine);
        continue;
      }
    }

    const target = adapter.resolveTarget(snapshot, selection);
    if (target.kind === 'unsupported') {
      noteReason(target.code);
      continue;
    }

    const anchor = adapter.locateInsertion(snapshot, target);
    if (anchor.kind === 'unsupported') {
      noteReason(anchor.code);
      continue;
    }

    if (usedAnchors.has(anchor.offset)) {
      continue;
    }

    const existingLog = nextLineIfLog(anchor);
    if (mode === 'toggle' && existingLog !== null) {
      usedAnchors.add(anchor.offset);
      pushDelete(existingLog);
      continue;
    }

    const body = adapter.renderLog({
      prefix,
      label: target.label,
      expression: target.expression
    }).body;

    if (
      mode === 'insert' &&
      existingLog !== null &&
      stripMarker(snapshot.lineAt(existingLog).text, pattern) === body
    ) {
      usedAnchors.add(anchor.offset);
      continue;
    }

    usedAnchors.add(anchor.offset);
    edits.push({
      kind: 'insert',
      offset: anchor.offset,
      text: `${snapshot.eol}${anchor.indent}${body}${markerSuffix}`
    });
  }

  return { edits, firstReason };
}
