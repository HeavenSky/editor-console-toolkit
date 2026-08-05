import { escapeLiteral } from '../escape';
import { createTemplateAdapter } from '../templateAdapter';

/** 使用字符串模板, 因此可见文本里的 `$` 必须转义, 否则会被当成插值. */
export const kotlinAdapter = createTemplateAdapter({
  id: 'kotlin',
  languageIds: ['kotlin'],
  commentPrefix: '//',
  quote: '"',
  escapeText: (raw, quote) => escapeLiteral(raw, quote, ['$']),
  render: ({ text, expr }) => `println("${text} \${${expr}}")`
});
