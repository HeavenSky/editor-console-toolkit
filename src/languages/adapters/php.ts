import { createTemplateAdapter } from '../templateAdapter';

/** `$` 属于变量名的一部分, 所以并入标识符字符集, 让光标停在 `$user` 上能取到完整变量. */
export const phpAdapter = createTemplateAdapter({
  id: 'php',
  languageIds: ['php'],
  commentPrefix: '//',
  quote: "'",
  identifierExtra: '$',
  render: ({ text, expr, q }) => `var_dump(${q}${text}${q}, ${expr});`
});
