import { createTemplateAdapter } from "../templateAdapter";

export const luaAdapter = createTemplateAdapter({
	id: "lua",
	languageIds: ["lua"],
	commentPrefix: "--",
	blockComment: { open: "--[[", close: "]]" },
	quote: '"',
	blockStyle: "keyword",
	blockOpenKeywords: ["function", "if", "for", "while", "repeat", "do"],
	restrictedBlockKeywords: [],
	render: ({ text, expr, q }) => `print(${q}${text}${q}, ${expr})`,
});
