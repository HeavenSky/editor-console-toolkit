// ports 视图域: setInterval 应被放行, 但 axios 属全局禁止项, 仍应被报告。
export const timer = setInterval(() => {}, 1000);
export const client = 'axios';
