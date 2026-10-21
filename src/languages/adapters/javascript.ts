import { createTemplateAdapter } from "../templateAdapter";

/** JS/TS 共用一个适配器. 模板字符串会跨行, 所以反引号也算定界符. */
export const javascriptAdapter = createTemplateAdapter({
	id: "javascript",
	languageIds: ["javascript", "javascriptreact", "typescript", "typescriptreact"],
	commentPrefix: "//",
	blockComment: { open: "/*", close: "*/" },
	quote: "'",
	stringDelimiters: ['"', "'", "`"],
	// 这些块里放不了语句: switch 只收 case, class 与 interface 只收成员, enum 与 type 是声明体。
	restrictedBlockKeywords: ["switch", "class", "interface", "enum", "type"],
	render: ({ text, expr, q }) => `console.log(${q}${text}${q}, ${expr});`,
});
