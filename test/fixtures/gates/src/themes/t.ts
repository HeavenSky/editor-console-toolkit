// themes 轮换域: setTimeout 与 onDidChangeConfiguration 应被放行, 但 axios 属全局禁止项, 仍应被报告。
export const timer = setTimeout(() => {}, 1000);
export const listener = 'onDidChangeConfiguration';
export const client = 'axios';
