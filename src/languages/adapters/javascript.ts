import { createTemplateAdapter } from "../templateAdapter";

/** JS/TS 共用一个适配器. 模板字符串会跨行, 所以反引号也算定界符. */
export const javascriptAdapter = createTemplateAdapter({
	id: "javascript",
	languageIds: ["javascript", "javascriptreact", "typescript", "typescriptreact"],
	commentPrefix: "//",
	blockComment: { open: "/*", close: "*/" },
	quote: "'",
	stringDelimiters: ['"', "'", "`"],
	// `$` 是合法标识符字符: 否则光标停在 `$value` 中段会取成 `value`.
	identifierExtra: "$",
	// JS/TS 有正则字面量, 词法层要与除法区分.
	regexLiterals: true,
	// 这些块里放不了语句: switch 只收 case, class 与 interface 只收成员, enum 与 type 是声明体。
	restrictedBlockKeywords: ["switch", "class", "interface", "enum", "type"],
	render: ({ text, expr, q }) => `console.log(${q}${text}${q}, ${expr});`,
});
