const {WebSocketServer} = require("ws");
const config = require("./common/config");
const {proxyChrome} = require("./common/helper");
const {sleep, datetime, formatError} = require("./common/utils");
const {douyin} = require("./lib/douyin");
const {taobao} = require("./lib/taobao");

process.on("unhandledRejection", (err) => {
	console.error(err);
});
["log", "warn", "error"].forEach((x) => {
	const fn = console[x];
	console[x] = function () {
		let args = Array.from(arguments);
		args.unshift(datetime() + "." + Date.now().toString().slice(-3));
		fn.apply(console, args);
	};
});

let wss = new WebSocketServer({port: 3333});
let online = false;
wss.on("connection", function connection(ws) {
	console.log("connection");
	global.chrome = proxyChrome(ws, () => {
		console.log("disconnected");
		online = false;
	});
	online = true;
});
wss.once("listening", () => {
	console.log("please connect to ws://localhost:3333?name=xxx to start");
});

function catchError(fn) {
	let prev_error = "";
	return function () {
		return fn().catch((e) => {
			let tmp = formatError(e);
			if (tmp != prev_error) {
				console.error("error", e instanceof Buffer ? e.toString() : e);
				prev_error = tmp;
			}
		});
	};
}

const tasks = [
	douyin, // 抖音
	taobao, // 淘宝
].map((x) => catchError(x));

async function main() {
	if (!config.telphone) throw "请在config.json中配置手机号";
	while (config.telphone) {
		await sleep(1000);
		if (!online) continue;
		for (let fn of tasks) {
			await fn();
		}
	}
}

main(...process.argv.slice(2))
	.catch((e) => {
		console.error(e);
	})
	.finally(() => {
		console.log("按任意键退出...");
		process.stdin.resume();
		process.stdin.on("data", () => {
			process.exit(0);
		});
	});
