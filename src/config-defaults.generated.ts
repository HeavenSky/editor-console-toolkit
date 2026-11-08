/**
 * 由 `scripts/gen-config.mjs` 从 package.json 的 contributes.configuration 生成, 提交入库。
 * NEVER 手改; 修改配置默认值后重跑 `node scripts/gen-config.mjs`, 漂移由 `npm run check` 卡住。
 */
export const CONFIG_DEFAULTS = {
	"prefix": "🎯🎯🎯 [DEBUG]",
	"ports.refreshInterval": 5000,
	"ports.killTimeout": 3000,
	"ports.hideSystemProcesses": true,
	"ports.systemPortMax": 1024,
	"ports.includeUdp": false,
} as const;
