import { escapeLiteral } from '../escape';
import { createTemplateAdapter } from '../templateAdapter';

/** 双引号字符串支持 `#{}` 插值, 因此可见文本里的 `#` 必须转义. */
export const rubyAdapter = createTemplateAdapter({
  id: 'ruby',
  languageIds: ['ruby'],
  commentPrefix: '#',
  quote: '"',
  escapeText: (raw, quote) => escapeLiteral(raw, quote, ['#']),
  render: ({ text, expr }) => `puts "${text} #{(${expr}).inspect}"`
});
