import * as vscode from 'vscode';
import { planEdits } from '../core/planEdits';
import type { CommandMode } from '../core/planEdits';
import { createSnapshot } from '../core/snapshot';
import type { EndOfLine, SelectionLike, UnsupportedCode } from '../core/types';
import { getAdapter } from '../languages/registry';

const DEFAULT_PREFIX = '🎯🎯🎯 [DEBUG]';

/** 控制字符(含 CR/LF)会破坏生成的字符串字面量, 静默剥离即可, 不打断用户操作. */
function sanitizePrefix(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

/**
 * 每次执行都重新读取配置, 不缓存也不监听变更.
 * 必须同时传 uri 与 languageId, 否则 language-overridable 作用域的语言级覆盖不会生效.
 */
function readPrefix(document: vscode.TextDocument): string {
  const raw = vscode.workspace
    .getConfiguration('editorConsoleToolkit', { uri: document.uri, languageId: document.languageId })
    .get<string>('prefix', DEFAULT_PREFIX);
  return sanitizePrefix(raw);
}

function warn(code: UnsupportedCode): void {
  // 源字符串即 l10n 的 lookup key, 因此必须是字面量, 不能拼接.
  switch (code) {
    case 'no-active-editor':
      void vscode.window.showWarningMessage(vscode.l10n.t('No active editor.'));
      return;
    case 'unsupported-language':
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Console Toolkit does not support this language yet.')
      );
      return;
    case 'multiline-selection':
      void vscode.window.showWarningMessage(vscode.l10n.t('Select a single-line expression.'));
      return;
    case 'unbalanced-syntax':
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Cannot find a safe place to insert the log.')
      );
      return;
    case 'cursor-in-comment':
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Place the cursor on an expression, not inside a comment.')
      );
      return;
    case 'cursor-in-string':
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Place the cursor on an expression, not inside a string.')
      );
      return;
    case 'empty-target':
      void vscode.window.showWarningMessage(vscode.l10n.t('Nothing to log at the cursor.'));
      return;
  }
}

export async function runConsoleLogCommand(mode: CommandMode): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    warn('no-active-editor');
    return;
  }

  const document = editor.document;
  const adapter = getAdapter(document.languageId);
  if (!adapter) {
    warn('unsupported-language');
    return;
  }

  const eol: EndOfLine = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const snapshot = createSnapshot(document.getText(), document.languageId, eol);
  const selections: SelectionLike[] = editor.selections.map((selection) => ({
    anchor: document.offsetAt(selection.anchor),
    active: document.offsetAt(selection.active)
  }));

  const plan = planEdits(snapshot, adapter, readPrefix(document), selections, mode);
  if (plan.edits.length === 0) {
    if (plan.firstReason) {
      warn(plan.firstReason);
    }
    return;
  }

  // 一次 edit 即一个 undo step. 所有 offset 都基于原文档坐标, VS Code 会自行处理相互位移.
  await editor.edit((builder) => {
    for (const edit of plan.edits) {
      if (edit.kind === 'insert') {
        builder.insert(document.positionAt(edit.offset), edit.text);
      } else {
        builder.delete(
          new vscode.Range(document.positionAt(edit.range.start), document.positionAt(edit.range.end))
        );
      }
    }
  });
}
