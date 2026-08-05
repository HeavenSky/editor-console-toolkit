import { doubleBraces, escapeLiteral } from '../escape';
import { createTemplateAdapter } from '../templateAdapter';

/**
 * 格式串里的花括号必须双写.
 * 定界符只保留 `"`: 生命周期 `'a` 与字符字面量 `'x'` 会让单引号扫描失准.
 * 目标值必须实现 Debug, README 已写明该限制.
 */
export const rustAdapter = createTemplateAdapter({
  id: 'rust',
  languageIds: ['rust'],
  commentPrefix: '//',
  quote: '"',
  stringDelimiters: ['"'],
  escapeText: (raw, quote) => doubleBraces(escapeLiteral(raw, quote)),
  render: ({ text, expr, q }) => `println!(${q}${text} {:?}${q}, ${expr});`
});
