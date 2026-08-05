import { createTemplateAdapter } from '../templateAdapter';

/** JS/TS 共用一个适配器. 模板字符串会跨行, 所以反引号也算定界符. */
export const javascriptAdapter = createTemplateAdapter({
  id: 'javascript',
  languageIds: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  commentPrefix: '//',
  quote: "'",
  stringDelimiters: ['"', "'", '`'],
  render: ({ text, expr, q }) => `console.log(${q}${text}${q}, ${expr});`
});
