const fs = require("fs");
const {parse, stringify} = require("comment-json");
function leftMerge(a, b) {
	for (let k in a) {
		let b1 = b[k];
		if (b1 == null) continue;
		let a1 = a[k];
		if (typeof a1 === "object" && !Array.isArray(a1)) leftMerge(a1, b1);
		else a[k] = b1;
	}
	return a;
}
let text = fs.readFileSync(require.resolve("../lib/config.json"), "utf8");
/** @type {import("../lib/config.json")} */
const config = parse(text);

try {
	let prev = fs.readFileSync("config.json", "utf8");
	leftMerge(config, parse(prev));
} catch (err) {
	if (err.code !== "ENOENT") {
		console.error("读取配置文件错误", err);
		process.exit(1);
	}
}
try {
	let text = stringify(config, null, 2);
	fs.writeFileSync("config.json", text);
} catch (err) {
	console.error("配置生成失败", err);
	process.exit(1);
}

module.exports = config;
