import type {
  DocumentSnapshot,
  ExpressionTarget,
  InsertionAnchor,
  RenderLogInput,
  RenderedLog,
  SelectionLike,
  Unsupported
} from '../core/types';

/**
 * 语言适配器只负责语言差异, 不调用 VS Code API, 也不执行编辑.
 * 12 个实例全部由 createTemplateAdapter 生成, 共用同一套解析与扫描实现.
 */
export interface LanguageAdapter {
  readonly id: string;
  readonly languageIds: readonly string[];
  /** 单行注释符, 决定所有权标记的写法. */
  readonly commentPrefix: string;
  resolveTarget(snapshot: DocumentSnapshot, selection: SelectionLike): ExpressionTarget | Unsupported;
  locateInsertion(snapshot: DocumentSnapshot, target: ExpressionTarget): InsertionAnchor | Unsupported;
  renderLog(input: RenderLogInput): RenderedLog;
  markerPattern(): RegExp;
}
