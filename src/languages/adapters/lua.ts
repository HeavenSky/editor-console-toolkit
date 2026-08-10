import { createTemplateAdapter } from '../templateAdapter';

export const luaAdapter = createTemplateAdapter({
  id: 'lua',
  languageIds: ['lua'],
  commentPrefix: '--',
  blockComment: { open: '--[[', close: ']]' },
  quote: '"',
  render: ({ text, expr, q }) => `print(${q}${text}${q}, ${expr})`
});
