// console 命令域: setInterval 应被门禁报告, axios 作为全局禁止项同样应被报告。
// 写成 export 是为了同时满足 tsconfig 的 strict 与 noUnusedLocals (本目录被 include)。
export const timer = setInterval(() => {}, 1000);
export const client = 'axios';
