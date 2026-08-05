import { createTemplateAdapter } from '../templateAdapter';

/** 用全限定名与 String.valueOf, 避免增加 import 也避免 null 拼接问题. */
export const javaAdapter = createTemplateAdapter({
  id: 'java',
  languageIds: ['java'],
  commentPrefix: '//',
  quote: '"',
  render: ({ text, expr, q }) => `System.out.println(${q}${text} ${q} + String.valueOf(${expr}));`
});
