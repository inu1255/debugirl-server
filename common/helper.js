function proxyChrome(ws, onclose) {
	let rid = 0;
	let id2cb = new Map();
	let cb2id = new Map();
	ws.on("message", function incoming(msg) {
		let message = msg.toString();
		// console.log("received:", message);
		if (message == "ping") return ws.send("pong");
		if (message == "pong") return;
		let data = JSON.parse(message);
		let item = id2cb.get(data.rid);
		if (!item) return;
		if (Array.isArray(data.args) && typeof item == "function") item(...data.args);
		else if (item.resolve && item.reject) {
			if (data.err) item.reject(data.err);
			else item.resolve(data.data);
			id2cb.delete(data.rid);
			cb2id.delete(item);
		} else console.error("invalid callback", data);
	});
	ws.on("close", () => {
		id2cb.forEach((x) => {
			if (x.reject) x.reject("closed");
		});
		id2cb.clear();
		cb2id.clear();
		onclose && onclose(ws);
	});
	function call(path, args) {
		return new Promise((resolve, reject) => {
			let pms = {resolve, reject};
			if (path == "chrome.scripting.executeScript") {
				let item = args[0];
				if (item.func) {
					let args = item.args || [];
					item.code = `(${item.func.toString()})(${args.map((x) => JSON.stringify(x)).join(",")})`;
					delete item.func;
				}
				pms.resolve = (x) => resolve([{result: x}]);
			}
			args = args.map((x) => {
				if (typeof x == "function") {
					let id = cb2id.get(x);
					if (id) {
						if (path.endsWith("removeListener")) {
							id2cb.delete(id);
							cb2id.delete(x);
						}
						return id;
					}
					rid++;
					id2cb.set(rid, x);
					cb2id.set(x, rid);
					return `callback_id:${rid}`;
				}
				return x;
			});
			rid++;
			// console.log("sending:", JSON.stringify({path, args, rid}));
			ws.send(JSON.stringify({path, args, rid}));
			id2cb.set(rid, pms);
			cb2id.set(pms, rid);
		});
	}
	function proxy(path) {
		return new Proxy(function () {}, {
			get(target, name) {
				if (name == "then") return;
				return proxy(path + "." + name);
			},
			apply(target, thisArg, argArray) {
				return call(path, argArray);
			},
		});
	}
	return proxy("chrome");
}
exports.proxyChrome = proxyChrome;

/**
 *
 * @param {chrome} chrome
 * @param {chrome.tabs.Tab} tab
 * @returns
 */
function waitComplete(chrome, tab) {
	return new Promise((resolve, reject) => {
		var timer = setInterval(() => {
			chrome.tabs.query({url: tab.url}).then((tabs) => {
				let item = tabs.find((x) => x.id == tab.id);
				if (!item) {
					fail("tab not found");
					return;
				}
				if (item.status == "complete") {
					success();
				}
			});
		}, 1e3);
		function listener(tabId, changeInfo) {
			if (tabId == tab.id && changeInfo.status == "complete") {
				success();
			}
		}
		function success() {
			clearInterval(timer);
			chrome.tabs.onUpdated.removeListener(listener);
			resolve();
		}
		function fail(err) {
			clearInterval(timer);
			chrome.tabs.onUpdated.removeListener(listener);
			reject(err);
		}
		chrome.tabs.onUpdated
			.addListener(listener)
			.then(() => {})
			.catch(fail);
	});
}
exports.waitComplete = waitComplete;
