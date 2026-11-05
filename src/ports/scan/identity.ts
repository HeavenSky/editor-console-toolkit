/** 解析 `ps -ww -o pid=,lstart=`; lstart 只作不透明创建标识, 不依赖它的 locale 形状。 */
export function parsePsIdentities(stdout: string): Map<number, string> {
	const identities = new Map<number, string>();

	for (const line of stdout.split("\n")) {
		const match = /^\s*(\d+)\s+(.+)$/.exec(line);
		const identity = match?.[2].trim();
		if (!match || !identity) continue;
		identities.set(Number(match[1]), identity);
	}

	return identities;
}
