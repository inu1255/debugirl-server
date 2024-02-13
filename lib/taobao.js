const {slide} = require("../captcha");
const fs = require("fs");
const https = require("https");
const {waitComplete} = require("../common/helper");
const {axios} = require("./api");
const config = require("../common/config");
const {sleep, encodeQuery} = require("../common/utils");

let slide_at = 0; // 破解时间
let search_at = 0; // 搜索时间
let reload_at = Date.now();
let slide_count = 0;
async function taobao() {
	let tabs = await chrome.tabs.query({
		title: "淘宝联盟",
	});
	let tab = tabs.find((x) => {
		return x.url.indexOf("https://pub.alimama.com/portal/v2/pages/promo/goods/index.htm") >= 0;
	});
	if (!tab) {
		tab = await chrome.tabs.create({
			url: "https://pub.alimama.com/portal/v2/pages/promo/goods/index.htm",
			index: 0,
			active: false,
		});
	}
	if (tab.status == "unloaded") await chrome.tabs.reload(tab.id);
	if (tab.status != "complete") await waitComplete(chrome, tab);
	// 破解滑块
	let frames = await chrome.webNavigation.getAllFrames({tabId: tab.id});
	let frame = frames.find(
		(x) => x.url.indexOf("/openapi/param2/1/gateway.unionpub/union.pub.entry") >= 0
	);
	if (frame) {
		let frame_point = await chrome.scripting
			.executeScript({
				target: {tabId: tab.id},
				func: function () {
					let slide = document.querySelector("#baxia-dialog-content");
					if (!slide) return;
					let rect = slide.getBoundingClientRect();
					return {x: rect.left, y: rect.top, width: rect.width, height: rect.height};
				},
			})
			.then((x) => x[0].result);
		console.log("frame_point", frame_point);
		if (frame_point.width) {
			if (slide_at + 5e3 > Date.now()) {
				return;
			}
			slide_count++;
			if (slide_count > 3) {
				await chrome.tabs.reload(tab.id);
				slide_count = 0;
				return;
			}
			console.log("有滑块");
			let ret = await crackSlide(tab, frame);
			if (!ret) {
				console.log("破解失败");
				return;
			}
			console.log("尝试破解", ret);
			if (!tab.active) await chrome.tabs.update(tab.id, {active: true});
			let x = Math.floor(frame_point.x + ret.x);
			let y = Math.floor(frame_point.y + ret.y);
			let dx = Math.floor(ret.dx);
			slide_at = Date.now();
			await slide({title: "淘宝联盟", x, y, dx, mouseenter: true});
			return;
		}
	}
	// 刷新页面
	if (reload_at + 1800e3 < Date.now()) {
		console.log("页面很久没刷新了,刷新一次...");
		reload_at = Date.now();
		await chrome.tabs.reload(tab.id);
		return;
	}
	// 搜索商品
	if (search_at + 10e3 < Date.now()) {
		search_at = Date.now();
		let n = await chrome.scripting
			.executeScript({
				target: {tabId: tab.id},
				func: function () {
					let list = document.querySelectorAll(".mux-radio-light");
					if (list.length > 0) {
						let n = Math.floor(Math.random() * list.length);
						let item = list[n];
						item.click();
						return n;
					}
					return -1;
				},
			})
			.then((x) => x[0].result);
		console.log("搜索商品", n);
		if (n >= 0) slide_count = 0;
	}
}
exports.taobao = taobao;

async function crackSlide(tab, frame) {
	return await chrome.scripting
		.executeScript({
			target: {tabId: tab.id, frameIds: [frame.frameId]},
			func: function () {
				let err = document.querySelector(".errloading");
				if (err) {
					let rect = err.getBoundingClientRect();
					return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, dx: 0};
				}
				let back = document.querySelector("#nc_1_wrapper");
				if (!back) return console.log("back not found");
				let back_rect = back.getBoundingClientRect();
				let slide = document.querySelector('[aria-label="滑块"]');
				if (!slide) return console.log("slide not found");
				let slide_rect = slide.getBoundingClientRect();
				let dx = back_rect.width - slide_rect.width;
				return {
					x: slide_rect.left + slide_rect.width / 2,
					y: slide_rect.top + slide_rect.height / 2,
					dx,
				};
			},
		})
		.then((x) => x[0].result);
}
