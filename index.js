const {WebSocketServer} = require("ws");
const config = require("./common/config");
const {proxyChrome, waitComplete} = require("./common/helper");
const {sleep, datetime, formatError, encodeQuery} = require("./common/utils");
const {slide} = require("./captcha");
const Axios = require("axios").default;

const axios = Axios.create({
	timeout: 10000,
});
axios.interceptors.response.use((res) => {
	if (res.data.code == 0) return res.data.data;
	throw res.data;
});

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

async function main() {
	if (!config.telphone) throw "请在config.json中配置手机号";
	let prev_error = "";
	while (true) {
		await sleep(1000);
		if (!online) continue;
		await start().catch((e) => {
			let tmp = formatError(e);
			if (tmp != prev_error) {
				console.error(e);
				prev_error = tmp;
			}
		});
	}
}

main(...process.argv.slice(2))
	.catch((e) => {
		console.error(e);
	})
	.finally(() => {
		console.log(`按任意键退出...`);
		process.stdin.resume();
		process.stdin.on("data", () => {
			process.exit(0);
		});
	});

let sms_send_at = 0; // 发验证码时间
let slide_at = 0; // 破解时间
let search_at = 0; // 搜索时间
let reload_at = Date.now();
async function start() {
	let tabs = await chrome.tabs.query({
		url: "https://buyin.jinritemai.com/dashboard/douke/merch-picking-hall",
	});
	let tab = tabs[0];
	if (!tab) {
		tab = await chrome.tabs.create({
			url: "https://buyin.jinritemai.com/dashboard/douke/merch-picking-hall",
			index: 0,
			active: false,
		});
	}
	if (tab.status == "unloaded") await chrome.tabs.reload(tab.id);
	if (tab.status != "complete") await waitComplete(chrome, tab);
	if (sms_send_at > 0) {
		console.log("等待验证码...");
		let code = await axios
			.get(config.smsList + "&pageSize=1000&create_at>=" + sms_send_at)
			.then((x) => {
				for (let item of x.list) {
					let m = /DK】验证码(\d{4})/.exec(item.content);
					if (m) {
						return m[1];
					}
				}
			});
		if (!code) {
			if (sms_send_at + 180e3 < Date.now()) {
				console.log("验证码超时");
				sms_send_at = 0;
			}
			return;
		}
		console.log(`获取到验证码: ${code}`);
		let ret = await chrome.scripting
			.executeScript({
				target: {tabId: tab.id},
				func: function (code) {
					let list = document.querySelectorAll("#uc-second-verify");
					let phone = list[list.length - 1];
					if (!phone) return;
					list = phone.querySelectorAll("input");
					let input = list[list.length - 1];
					if (!input || !input._valueTracker) return;
					input.value = code;
					input._valueTracker.setValue("");
					input.dispatchEvent(new Event("input", {bubbles: true, cancelable: true}));
					list = phone.querySelectorAll(".uc-ui-verify_sms-input_button");
					let btn = list[list.length - 1];
					if (!btn) return;
					if (!/disabled/.test(btn.className)) {
						btn.click();
						let error = phone.querySelector(".uc-ui-verify_error");
						if (error) return error.innerText;
						return true;
					}
				},
				args: [code],
			})
			.then((x) => x[0].result);
		console.log(`点击验证`, ret);
		sms_send_at = 0;
		return;
	}
	let phone = await chrome.scripting
		.executeScript({
			target: {tabId: tab.id},
			func: function (tel) {
				let list = document.querySelectorAll("#uc-second-verify");
				let phone = list[list.length - 1];
				if (!phone) return;
				let input = phone.querySelector("input");
				if (!input || !input._valueTracker) return;
				input.value = tel;
				input._valueTracker.setValue("");
				input.dispatchEvent(new Event("input", {bubbles: true, cancelable: true}));
				let btn = phone.querySelector(".uc-ui-input_right>p");
				if (!btn) return;
				if (/重新发送|获取验证码/.test(btn.innerText)) {
					btn.click();
					return true;
				}
			},
			args: [config.telphone],
		})
		.then((x) => x[0].result);
	if (phone) {
		console.log("已经发送验证码, 接收中...");
		sms_send_at = Date.now();
		return;
	}
	let frames = await chrome.webNavigation.getAllFrames({tabId: tab.id});
	let frame = frames.find((x) =>
		x.url.startsWith("https://rmc.bytedance.com/verifycenter/captcha/v2")
	);
	if (frame) {
		if (slide_at + 15e3 < Date.now()) {
			console.log("滑块太频繁");
			return;
		}
		console.log("有滑块");
		let frame_point = await chrome.scripting
			.executeScript({
				target: {tabId: tab.id},
				func: function () {
					let slide = document.querySelector("#captcha_container>iframe");
					if (!slide) return;
					let rect = slide.getBoundingClientRect();
					console.log({x: rect.left, y: rect.top});
					return {x: rect.left, y: rect.top};
				},
			})
			.then((x) => x[0].result);
		let ret = await crackSlide(tab, frame);
		if (!ret) {
			console.log("破解失败");
			await chrome.scripting
				.executeScript({
					target: {tabId: tab.id, frameIds: [frame.frameId]},
					func: function () {
						let refresh = document.querySelector(".vc-captcha-refresh");
						if (!refresh) return;
						refresh.click();
					},
				})
				.then((x) => x[0].result);
			return;
		}
		console.log("尝试破解", ret);
		// if (!tab.active) await chrome.tabs.update(tab.id, {active: true});
		let x = Math.floor(frame_point.x + ret.x);
		let y = Math.floor(frame_point.y + ret.y);
		let dx = Math.floor(ret.dx);
		slide_at = Date.now();
		await slide({x, y, dx});
		return;
	}
	if (reload_at + 3600e3 < Date.now()) {
		console.log("页面很久没刷新了,刷新一次...");
		reload_at = Date.now();
		await chrome.tabs.reload(tab.id);
	}
	if (search_at + 10e3 < Date.now()) {
		search_at = Date.now();
		let title = "手机";
		let pgNo = 1;
		let url =
			"https://buyin.jinritemai.com/pc/selection/search/pmt?" +
			encodeQuery({
				page_type: "0",
				page: pgNo,
				page_size: "20",
				rec_page: pgNo,
				rec_page_size: "20",
				search_text: title,
				category_ids_v2: "",
				search_id: "",
				input_query: title,
				is_product_distribution: "false",
				is_delivery_guarantee: "false",
				is_ladder_cos: "false",
				is_wu_you: "false",
			});
		await chrome.scripting.executeScript({
			target: {tabId: tab.id},
			func: function (url) {
				return fetch(url).then((x) => x.json());
			},
			args: [url],
		});
	}
}

async function crackSlide(tab, frame) {
	return await chrome.scripting
		.executeScript({
			target: {tabId: tab.id, frameIds: [frame.frameId]},
			func: function () {
				let back = document.querySelector("#captcha_verify_image");
				if (!back) return console.log("back not found");
				let back_rect = back.getBoundingClientRect();
				let slide = document.querySelector("#captcha-verify_img_slide");
				if (!slide) return console.log("slide not found");
				let btn = document.querySelector(".captcha-slider-btn");
				if (!btn) return console.log("btn not found");
				// slide.style.transform = "translateX(0)";
				let slide_rect = slide.getBoundingClientRect();
				let ctx = back.getContext("2d");
				let scaleX = back.width / back_rect.width;
				let scaleY = back.height / back_rect.height;
				let x = (slide_rect.left - back_rect.left) * scaleX;
				let y = (slide_rect.top - back_rect.top) * scaleY - 7;
				let width = slide_rect.width * scaleX;
				let height = slide_rect.height * scaleY;
				let bx = Math.floor(x + width);
				let by = Math.floor(y + height / 2);
				let imageData = ctx.getImageData(0, 0, back.width, back.height);
				let data = imageData.data;
				console.log("=============");
				function isWhite(x, y, msg) {
					let i = (y * imageData.width + x) * 4;
					let ok = data[i] >= 200 && data[i + 1] >= 200 && data[i + 2] >= 200;
					// if (!ok && !msg) {
					// 	ctx.fillStyle = "red";
					// 	ctx.fillRect(x, y, 1, 1);
					// }
					if (ok) {
						console.log(`${x},${y}: rgb(${data[i]},${data[i + 1]},${data[i + 2]})`);
						return true;
					}
					if (msg) console.log(msg, `${x},${y}: rgb(${data[i]},${data[i + 1]},${data[i + 2]})`);
				}
				// 白边距离图片左边6px
				let x0 = (x + width / 2) / scaleX + back_rect.left + 6;
				let x1 = 0;
				for (let i = bx; i < imageData.width; i++) {
					if (isWhite(i, by)) {
						let ok = true;
						console.log("in", i);
						for (let j = 0; j < 10; j++) {
							if (!isWhite(i, by + j + 38, "outx")) {
								ok = false;
								break;
							}
							if (!isWhite(i, by - j - 1, "outs")) {
								ok = false;
								break;
							}
						}
						if (ok) {
							console.log("find", i);
							x1 = (i + width / 2) / scaleX + back_rect.left;
							break;
						}
					}
				}
				if (!x1) {
					by -= 15;
					for (let i = bx; i < imageData.width; i++) {
						if (isWhite(i, by)) {
							let ok = true;
							console.log("in", i);
							for (let j = 0; j < 10; j++) {
								if (!isWhite(i, by + j + 45, "outx")) {
									ok = false;
									break;
								}
								if (!isWhite(i, by - j - 1, "outs")) {
									ok = false;
									break;
								}
							}
							if (ok) {
								console.log("find", i);
								x1 = (i + width / 2) / scaleX + back_rect.left;
								break;
							}
						}
					}
				}
				console.log(x1);
				if (!x1) return console.log("x1 not found");
				let btn_rect = btn.getBoundingClientRect();
				x = btn_rect.left + +btn_rect.width / 2;
				y = btn_rect.top + btn_rect.height / 2;
				let dx = x1 - x0;
				return {x, y, dx};
			},
		})
		.then((x) => x[0].result);
}
