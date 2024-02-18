const {slide} = require("../captcha");
const {waitComplete} = require("../common/helper");
const {axios} = require("./api");
const config = require("../common/config");
const {sleep, encodeQuery} = require("../common/utils");
const {slideDx} = require("../common/opencv");

let sms_send_at = 0; // 发验证码时间
let wait_time = 60e3; // 等待时间
let next_at = 0; // 下一次执行时间
let next_error = ""; // 错误等待原因
let slide_at = 0; // 破解时间
let search_at = 0; // 搜索时间
let reload_at = Date.now();
let slide_count = 0;

function console_log(...args) {
	console.log("douyin", ...args);
}

async function douyin() {
	if (!config.telphone || !config.smsList)
		throw "抖音滑块 - 请在config.json中配置手机号和验证码查询接口";
	if (next_at > Date.now()) {
		throw "等待:" + wait_time / 60e3 + "分钟 " + next_error;
	}
	let tabs = await chrome.tabs.query({
		url: "https://buyin.jinritemai.com/dashboard/douke/merch-picking-hall",
	});
	if (!tabs.length) {
		tabs = await chrome.tabs.query({
			title: "巨量百应Buyin",
		});
	}
	let tab = tabs[0];
	if (!tab) {
		tab = await chrome.tabs.create({
			url: "https://buyin.jinritemai.com/dashboard/douke/merch-picking-hall",
			index: 0,
			active: false,
		});
	} else if (tab.url.startsWith("https://buyin.jinritemai.com/mpa/account/douke-login")) {
		// 需要登录
		throw "需要登录";
	} else if (tab.url != "https://buyin.jinritemai.com/dashboard/douke/merch-picking-hall") {
		throw "抖音url:" + tab.url;
	}
	if (tab.status == "unloaded") await chrome.tabs.reload(tab.id);
	if (tab.status != "complete") await waitComplete(chrome, tab);
	tabs = await chrome.tabs.query({index: tab.index});
	tab = tabs[0];
	// 输入验证码
	if (sms_send_at > 0) {
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
				next_error = "验证码超时";
				next_at = Date.now() + wait_time;
				wait_time *= 2;
				sms_send_at = 0;
			}
			return;
		}
		console_log(`获取到验证码: ${code}`);
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
		console_log("点击验证", ret);
		sms_send_at = 0;
		return;
	}
	// 发送验证码
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
					let error = phone.querySelector(".uc-ui-verify_error");
					if (error && error.innerText) return error.innerText;
					return "ok";
				}
			},
			args: [config.telphone],
		})
		.then((x) => x[0].result);
	if (phone == "ok") {
		console_log("已经发送验证码, 接收中...");
		sms_send_at = Date.now();
		return;
	}
	if (/过期/.test(phone)) {
		await chrome.tabs.reload(tab.id);
	}
	if (phone) throw phone;
	// 破解滑块
	let frames = await chrome.webNavigation.getAllFrames({tabId: tab.id});
	let frame = frames.find((x) =>
		x.url.startsWith("https://rmc.bytedance.com/verifycenter/captcha/v2")
	);
	if (frame) {
		if (slide_at + 5e3 > Date.now()) {
			return;
		}
		slide_count++;
		if (slide_count > 3) {
			await chrome.tabs.reload(tab.id);
			slide_count = 0;
			return;
		}
		console_log("有滑块");
		let frame_point = await chrome.scripting
			.executeScript({
				target: {tabId: tab.id},
				func: function () {
					let slide = document.querySelector("#captcha_container>iframe");
					if (!slide) return;
					let rect = slide.getBoundingClientRect();
					return {x: rect.left, y: rect.top};
				},
			})
			.then((x) => x[0].result);
		let ret = await crackSlide(tab, frame);
		if (!ret) {
			console_log("破解失败");
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
		console_log("尝试破解", ret);
		if (!tab.active) await chrome.tabs.update(tab.id, {active: true});
		let x = Math.floor(frame_point.x + ret.x);
		let y = Math.floor(frame_point.y + ret.y);
		let dx = Math.floor(ret.dx);
		slide_at = Date.now();
		await slide({title: "巨量百应Buyin", x, y, dx});
		return;
	}
	// 刷新页面
	if (reload_at + 1800e3 < Date.now()) {
		console_log("页面很久没刷新了,刷新一次...");
		reload_at = Date.now();
		await chrome.tabs.reload(tab.id);
		return;
	}
	// 搜索商品
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
		let ok = true;
		await Promise.race([
			chrome.scripting
				.executeScript({
					target: {tabId: tab.id},
					func: function (url) {
						return fetch(url).then((x) => x.json());
					},
					args: [url],
				})
				.then(() => {
					if (ok) slide_count = 0;
					// if (ok) reload_at = Date.now();
				})
				.catch((e) => console.error(e)),
			sleep(5e3),
		]);
		ok = false;
	}
}
exports.douyin = douyin;

async function crackSlide(tab, frame) {
	let ret = await chrome.scripting
		.executeScript({
			target: {tabId: tab.id, frameIds: [frame.frameId]},
			func: function () {
				let back = document.querySelector("#captcha_verify_image");
				if (!back) return console.error("back not found");
				let back_rect = back.getBoundingClientRect();
				let slide = document.querySelector("#captcha-verify_img_slide");
				if (!slide) return console.error("slide not found");
				let btn = document.querySelector(".captcha-slider-btn");
				if (!btn) return console.error("btn not found");
				// slide.style.transform = "translateX(0)";
				let slide_rect = slide.getBoundingClientRect();
				let scaleX = back.width / back_rect.width;
				let scaleY = back.height / back_rect.height;
				let y = Math.round((slide_rect.top - back_rect.top) * scaleY);
				let height = Math.round(slide_rect.height * scaleY);
				let canvas = document.createElement("canvas");
				canvas.width = back.width;
				canvas.height = height;
				let ctx = canvas.getContext("2d");
				ctx.drawImage(back, 0, 0, back.width, back.height, 0, -y, back.width, back.height);
				let btn_rect = btn.getBoundingClientRect();
				let x = btn_rect.left + +btn_rect.width / 2;
				y = btn_rect.top + btn_rect.height / 2;
				return {
					x,
					y,
					scaleX,
					back: canvas.toDataURL("image/png"),
					slide: slide.src,
				};
			},
		})
		.then((x) => x[0].result);
	if (!ret) return;
	let back = Buffer.from(ret.back.replace(/^data:image\/\w+;base64,/, ""), "base64");
	let slide = await axios
		.get(ret.slide, {responseType: "arraybuffer"})
		.then((x) => Buffer.from(x.data));
	let dx = await slideDx(back, slide);
	return {
		x: ret.x,
		y: ret.y,
		dx: dx / ret.scaleX,
	};
}
