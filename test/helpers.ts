import { createSnapshot } from '../src/core/snapshot';
import type { DocumentSnapshot, EditPlan, EndOfLine, PlannedEdit, SelectionLike } from '../src/core/types';

export function snap(text: string, languageId = 'typescript', eol: EndOfLine = '\n'): DocumentSnapshot {
  return createSnapshot(text, languageId, eol);
}

/** 空选择, 光标落在 needle 内部 (末字符之后), 用来模拟"光标停在标识符上". */
export function caretIn(text: string, needle: string): SelectionLike {
  const index = text.indexOf(needle);
  if (index === -1) throw new Error(`文本里找不到 ${JSON.stringify(needle)}`);
  const offset = index + needle.length;
  return { anchor: offset, active: offset };
}

/** 显式选中 needle. */
export function select(text: string, needle: string): SelectionLike {
  const index = text.indexOf(needle);
  if (index === -1) throw new Error(`文本里找不到 ${JSON.stringify(needle)}`);
  return { anchor: index, active: index + needle.length };
}

const positionOf = (edit: PlannedEdit): number =>
  edit.kind === 'insert' ? edit.offset : edit.range.start;

/**
 * 把编辑计划应用到原文。
 *
 * 计划里的 offset 全部基于同一份原文快照 (真实执行时由一次 TextEditor.edit 提交),
 * 因此这里必须从后往前应用, 否则前面的编辑会让后面的 offset 失效。
 */
export function apply(text: string, plan: EditPlan): string {
  let out = text;
  for (const edit of [...plan.edits].sort((a, b) => positionOf(b) - positionOf(a))) {
    if (edit.kind === 'insert') {
      out = out.slice(0, edit.offset) + edit.text + out.slice(edit.offset);
    } else {
      out = out.slice(0, edit.range.start) + out.slice(edit.range.end);
    }
  }
  return out;
}
