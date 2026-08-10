import { createTemplateAdapter } from '../templateAdapter';

/** 只有双引号字符串; 插值写法是 `\(...)`, 基础转义已经把 `\` 变成 `\\`, 不会误触发. */
export const swiftAdapter = createTemplateAdapter({
  id: 'swift',
  languageIds: ['swift'],
  commentPrefix: '//',
  blockComment: { open: '/*', close: '*/' },
  quote: '"',
  restrictedBlockKeywords: ['switch', 'class', 'struct', 'enum', 'protocol', 'extension'],
  stringDelimiters: ['"'],
  render: ({ text, expr, q }) => `print(${q}${text}${q}, ${expr})`
});
