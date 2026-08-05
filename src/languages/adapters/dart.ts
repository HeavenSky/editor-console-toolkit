import { escapeLiteral } from '../escape';
import { createTemplateAdapter } from '../templateAdapter';

/** 使用 `${}` 插值, 因此可见文本里的 `$` 必须转义. */
export const dartAdapter = createTemplateAdapter({
  id: 'dart',
  languageIds: ['dart'],
  commentPrefix: '//',
  quote: "'",
  escapeText: (raw, quote) => escapeLiteral(raw, quote, ['$']),
  render: ({ text, expr, q }) => `print(${q}${text} \${${expr}}${q});`
});
