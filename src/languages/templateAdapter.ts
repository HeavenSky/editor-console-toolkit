import { markerPatternFor } from '../core/logMarker';
import { resolveSelection } from '../core/selectionResolver';
import { locateAnchor } from '../core/statementScanner';
import type { ScanConfig } from '../core/statementScanner';
import type {
  DocumentSnapshot,
  ExpressionTarget,
  InsertionAnchor,
  RenderLogInput,
  RenderedLog,
  SelectionLike,
  Unsupported
} from '../core/types';
import { escapeLiteral } from './escape';
import type { LanguageAdapter } from './languageAdapter';

export type RenderContext = {
  /** 已转义的可见文本, 形如 `[ECT] user:`. */
  text: string;
  /** 已转义的可见文本, 不带结尾冒号, 供 label 型 API 使用. */
  bareText: string;
  /** 原始表达式代码. */
  expr: string;
  /** 本语言生成字符串字面量时使用的引号. */
  q: string;
};

export type TemplateSpec = {
  readonly id: string;
  readonly languageIds: readonly string[];
  readonly commentPrefix: string;
  readonly quote: '"' | "'";
  /** 追加到标识符字符集的字符, 例如 PHP 的 `$`. */
  readonly identifierExtra?: string;
  /** 字符串定界符, 默认 `"` 与 `'`. */
  readonly stringDelimiters?: readonly string[];
  /** 覆盖默认转义, 用于插值语言与格式串语言. */
  readonly escapeText?: (raw: string, quote: string) => string;
  readonly render: (ctx: RenderContext) => string;
};

const DEFAULT_DELIMITERS = ['"', "'"] as const;

export function createTemplateAdapter(spec: TemplateSpec): LanguageAdapter {
  const identifierExtra = spec.identifierExtra ?? '';
  const scanConfig: ScanConfig = {
    commentPrefix: spec.commentPrefix,
    stringDelimiters: spec.stringDelimiters ?? DEFAULT_DELIMITERS
  };
  const escape = spec.escapeText ?? ((raw: string, quote: string) => escapeLiteral(raw, quote));
  const pattern = markerPatternFor(spec.commentPrefix);

  return {
    id: spec.id,
    languageIds: spec.languageIds,
    commentPrefix: spec.commentPrefix,

    resolveTarget(snapshot: DocumentSnapshot, selection: SelectionLike): ExpressionTarget | Unsupported {
      return resolveSelection(snapshot, selection, identifierExtra);
    },

    locateInsertion(snapshot: DocumentSnapshot, target: ExpressionTarget): InsertionAnchor | Unsupported {
      return locateAnchor(snapshot, target, scanConfig);
    },

    renderLog(input: RenderLogInput): RenderedLog {
      // 空 prefix 时不留前导空格, 直接以 label 开头.
      const bare = input.prefix ? `${input.prefix} ${input.label}` : input.label;
      const escapedBare = escape(bare, spec.quote);
      const escapedColon = escape(`${bare}:`, spec.quote);
      return {
        body: spec.render({
          text: escapedColon,
          bareText: escapedBare,
          expr: input.expression,
          q: spec.quote
        })
      };
    },

    markerPattern(): RegExp {
      return pattern;
    }
  };
}
