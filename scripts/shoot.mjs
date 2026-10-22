// 功能截图: 在独立的 VS Code 实例里演示各功能并截图, 启动与截图的公共部分见 scripts/lib/shoot-ext.mjs.
// 用法: node scripts/shoot.mjs [输出目录, 默认 artifacts/shots] [--readme] [场景名过滤...]
//   console-log      Console Toolkit: 插入的日志与注释掉的日志
//   ports            Port Toolkit: 工作区里启动的两个服务, 展开一行看详情
//   checksums        Checksum Toolkit: 命令面板里的两个命令
//   cleanup          Cleanup Toolkit: 清理历史与缓存的确认框, 列出将清理的条目
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { launch, gitInit } from "./lib/shoot-ext.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const APP_TS = `import { readFile } from './io';

interface User {
  id: number;
  profile: { name: string; email: string };
}

export async function loadUser(id: number): Promise<User> {
  const raw = await readFile(\`users/\${id}.json\`);
  const user: User = JSON.parse(raw);
  const total = user.profile.name.length;
  return user;
}

export function greet(user: User) {
  const message = \`Hello, \${user.profile.name}\`;
  return message;
}
`;

// 演示用的 HTTP 服务, 在工作区的子目录里启动, 让 Port Toolkit 标出 this workspace
const SERVER = `import http from 'node:http';
const port = Number(process.argv[2]);
http.createServer((_, res) => res.end('ok')).listen(port, '127.0.0.1');
`;

const servers = [];
const h = await launch({
	repo: REPO,
	id: "ect",
	port: 9334,
	setup(ws) {
		fs.mkdirSync(path.join(ws, "src"), { recursive: true });
		fs.writeFileSync(path.join(ws, "src/app.ts"), APP_TS);
		fs.writeFileSync(
			path.join(ws, "src/io.ts"),
			"export const readFile = async (p: string) => p;\n"
		);
		for (const [dir, port] of [
			["apps/web", 5173],
			["apps/api", 3000],
		]) {
			fs.mkdirSync(path.join(ws, dir), { recursive: true });
			fs.writeFileSync(path.join(ws, dir, "server.mjs"), SERVER);
			servers.push(
				spawn(process.execPath, ["server.mjs", String(port)], {
					cwd: path.join(ws, dir),
					stdio: "ignore",
				})
			);
		}
		fs.writeFileSync(
			path.join(ws, "package.json"),
			'{ "name": "toolkit-demo", "private": true }\n'
		);
		gitInit(ws);
	},
	// 确认框用自绘样式, 原生对话框截不进窗口画面
	settings: { "editorConsoleToolkit.ports.refreshInterval": 0, "window.dialogStyle": "custom" },
});
const { page } = h;

try {
	if (h.want("console-log")) {
		await h.openFile("app.ts");
		// 光标放在变量上按 Alt+L 插入日志; 从下往上插, 前面的行号不受影响. 第二处光标在 name 上, 演示属性链 user.profile.name
		for (const [line, col] of [
			[16, 9],
			[11, 30],
			[10, 9],
		]) {
			await h.goto(line, col);
			await h.press("Alt+L", 800);
		}
		await h.command("Notifications: Clear All Notifications", 500);
		await h.goto(1, 1);
		await h.shot("console-log", {
			clip: page.locator("#workbench\\.parts\\.editor"),
			pad: 0,
			maxHeight: 480,
		});
		await h.command("Console Toolkit: Toggle All Console Logs", 1000);
		await h.goto(1, 1);
		await h.shot("console-log-toggled", {
			clip: page.locator("#workbench\\.parts\\.editor"),
			pad: 0,
			maxHeight: 480,
		});
		await h.reset();
	}

	if (h.want("ports")) {
		await h.command("View: Show Port Toolkit", 3000);
		await h.command("Port Toolkit: Search Ports", 800);
		await h.type("ect-shoot", 600);
		await h.press("Enter", 2500);
		// 侧栏加宽, 展开第一个进程行
		for (let i = 0; i < 6; i++) await h.command("View: Increase Current View Size", 200);
		const row = page.locator('.part.sidebar .monaco-list-row[aria-level="1"]').nth(1);
		await row.click();
		await h.press("ArrowRight", 1500);
		const box = await page.locator(".part.sidebar").boundingBox();
		await h.shot("ports", { clip: { x: box.x, y: box.y, width: box.width, height: 330 } });
		await h.command("View: Close Primary Side Bar", 500);
	}

	if (h.want("checksums")) {
		await h.palette("Checksum Toolkit", 1200);
		await h.shot("checksums", { clip: page.locator(".quick-input-widget"), pad: 4 });
		await h.escape();
	}

	if (h.want("cleanup")) {
		await h.command("Cleanup Toolkit: Clear History and Caches", 1500);
		await h.shot("cleanup", { clip: page.locator(".monaco-dialog-box"), pad: 4 });
		await h.escape();
	}
} finally {
	await h.close();
	for (const s of servers) s.kill();
}
