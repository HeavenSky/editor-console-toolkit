import { escapeLiteral } from '../escape';
import { createTemplateAdapter } from '../templateAdapter';

/** IO.inspect 的 label 会自动补上 `: `, 所以用不带冒号的 bareText. 字符串支持 `#{}` 插值. */
export const elixirAdapter = createTemplateAdapter({
  id: 'elixir',
  languageIds: ['elixir'],
  commentPrefix: '#',
  quote: '"',
  escapeText: (raw, quote) => escapeLiteral(raw, quote, ['#']),
  render: ({ bareText, expr, q }) => `IO.inspect(${expr}, label: ${q}${bareText}${q})`
});
