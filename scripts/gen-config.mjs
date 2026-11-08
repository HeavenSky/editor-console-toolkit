/**
 * 从 package.json 的 `contributes.configuration` 生成运行时默认值模块 `src/config-defaults.generated.ts`。
 *
 * 默认值的唯一真源是 package.json 的 `default`; 本插件的单测与 `get()` 的 fallback 都不依赖
 * `vscode` 模块, 运行时需要同一份默认值时只能由这里生成, NEVER 在 src 手写第二份字面量。
 * 生成物提交入库; 修改配置默认值后重跑本脚本, 漂移由 `npm run check` 卡住 (`--check` 模式)。
 *
 * 用法: node scripts/gen-config.mjs [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TARGET = join(ROOT, "src/config-defaults.generated.ts");
const PREFIX = "editorConsoleToolkit.";

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

/** 提取本插件全部配置项的默认值, 键名去掉 `editorConsoleToolkit.` 前缀。 */
function collectDefaults(pkg) {
	const entries = [];
	const configurations = pkg.contributes?.configuration ?? [];
	for (const configuration of Array.isArray(configurations) ? configurations : [configurations]) {
		for (const [id, prop] of Object.entries(configuration.properties ?? {})) {
			if (!id.startsWith(PREFIX)) continue;
			if (!("default" in prop)) throw new Error(`${id} 缺少 default, 先补全 package.json`);
			entries.push([id.slice(PREFIX.length), prop.default]);
		}
	}
	if (entries.length === 0) throw new Error("contributes.configuration 中没有本插件的配置项");
	return entries;
}

function render(entries) {
	const lines = [
		"/**",
		" * 由 `scripts/gen-config.mjs` 从 package.json 的 contributes.configuration 生成, 提交入库。",
		" * NEVER 手改; 修改配置默认值后重跑 `node scripts/gen-config.mjs`, 漂移由 `npm run check` 卡住。",
		" */",
		"export const CONFIG_DEFAULTS = {",
		...entries.map(([key, value]) => `\t${JSON.stringify(key)}: ${JSON.stringify(value)},`),
		"} as const;",
	];
	return `${lines.join("\n")}\n`;
}

const entries = collectDefaults(readJson(join(ROOT, "package.json")));
const content = render(entries);

if (process.argv.includes("--check")) {
	const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
	if (current !== content) {
		console.error(
			"config-defaults.generated.ts 与 package.json 不一致, 请重跑 node scripts/gen-config.mjs"
		);
		process.exit(1);
	}
	console.log("ok  config-defaults.generated.ts 与 package.json 一致");
	process.exit(0);
}

writeFileSync(TARGET, content);
console.log(`generated ${TARGET}`);
