import { createTemplateAdapter } from '../templateAdapter';

export const pythonAdapter = createTemplateAdapter({
  id: 'python',
  languageIds: ['python'],
  commentPrefix: '#',
  quote: "'",
  blockStyle: 'colon-indent',
  restrictedBlockKeywords: ['match'],
  // 三引号必须排在单引号之前: 匹配时长的优先, 否则 `"""` 会被拆成三个单引号定界符.
  stringDelimiters: ['"""', "'''", '"', "'"],
  render: ({ text, expr, q }) => `print(${q}${text}${q}, ${expr})`
});
