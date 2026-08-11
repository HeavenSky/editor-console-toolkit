// checksums 命令域: readFileSync 应被放行 (它要读 product.json), 但 axios 属全局禁止项, 仍应被报告。
export const reader = 'readFileSync';
export const client = 'axios';
