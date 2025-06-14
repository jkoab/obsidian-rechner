module.exports = {
	root: true,
	parser: "@typescript-eslint/parser",
	env: {
		browser: true,
		node: false,
	},
	plugins: ["@typescript-eslint", "promise", "obsidianmd"],
	extends: [
		"plugin:obsidianmd/recommended",
		"eslint:recommended",
		"plugin:@typescript-eslint/eslint-recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:promise/recommended",
	],
	parserOptions: {
		project: "./tsconfig.json",
		ecmaVersion: 2020,
		sourceType: "module",
	},
	rules: {
		"no-unused-vars": "off",
		"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
		"@typescript-eslint/ban-ts-comment": "off",
		"no-prototype-builtins": "off",
		"@typescript-eslint/no-empty-function": "off",
	},
};
