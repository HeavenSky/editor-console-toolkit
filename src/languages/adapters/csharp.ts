import { doubleBraces, escapeLiteral } from '../escape';
import { createTemplateAdapter } from '../templateAdapter';

/** 复合格式串: 可见文本里的花括号必须双写, 否则会被当成占位符. 用全限定名避免依赖 using System. */
export const csharpAdapter = createTemplateAdapter({
  id: 'csharp',
  languageIds: ['csharp'],
  commentPrefix: '//',
  quote: '"',
  escapeText: (raw, quote) => doubleBraces(escapeLiteral(raw, quote)),
  render: ({ text, expr, q }) => `System.Console.WriteLine(${q}${text} {0}${q}, ${expr});`
});
