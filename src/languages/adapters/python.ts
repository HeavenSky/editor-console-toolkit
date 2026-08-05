import { createTemplateAdapter } from '../templateAdapter';

export const pythonAdapter = createTemplateAdapter({
  id: 'python',
  languageIds: ['python'],
  commentPrefix: '#',
  quote: "'",
  render: ({ text, expr, q }) => `print(${q}${text}${q}, ${expr})`
});
