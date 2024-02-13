module.exports = {
	env: {
		commonjs: true,
		es2021: true,
		node: true,
		browser: true,
	},
	extends: "eslint:recommended",
	overrides: [
		{
			env: {
				node: true,
			},
			files: [".eslintrc.{js,cjs}"],
			parserOptions: {
				sourceType: "script",
			},
		},
	],
	parserOptions: {
		ecmaVersion: "latest",
	},
	globals: {
		chrome: "readonly",
	},
	rules: {
		"no-inner-declarations": "off",
		indent: ["error", "tab"],
		"linebreak-style": ["error", "unix"],
		quotes: ["error", "double", {avoidEscape: true}],
		semi: ["error", "always"],
		"no-unused-vars": "warn",
	},
};
