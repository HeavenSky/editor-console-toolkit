import { createTemplateAdapter } from '../templateAdapter';

export const luaAdapter = createTemplateAdapter({
  id: 'lua',
  languageIds: ['lua'],
  commentPrefix: '--',
  quote: '"',
  render: ({ text, expr, q }) => `print(${q}${text}${q}, ${expr})`
});
