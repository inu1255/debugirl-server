const ffi = require("ffi-napi");
const wchar = require("./common/wchar");
const {sleep, rand} = require("./common/utils");

const user32 = new ffi.Library("user32.dll", {
	FindWindowW: ["long", [wchar.string, wchar.string]],
	PostMessageW: ["bool", ["long", "uint", "long", "long"]],
});

function MakeLParam(LoWord, HiWord) {
	return (HiWord << 16) | (LoWord & 0xffff);
}

const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_MOUSEMOVE = 0x0200;

async function slide({title, x, y, dx, mouseenter}) {
	const wname = title + " - Google Chrome";
	const hwnd = user32.FindWindowW("Chrome_WidgetWin_1", wname);

	if (hwnd === 0) {
		throw "window not found";
	}
	// 状态栏高度
	y += 122;

	const endX = x + dx;
	const endY = y;

	if (mouseenter) {
		let x0 = 0;
		let y0 = 0;
		user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, MakeLParam(x0, y0));
		while (x0 < x || y0 < y) {
			x0 = Math.min(x0 + rand(10, 20), x);
			y0 = Math.min(y0 + rand(10, 20), y);
			user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, MakeLParam(x0, y0));
			await sleep(10);
		}
	}

	// mouse down
	user32.PostMessageW(hwnd, WM_LBUTTONDOWN, 1, MakeLParam(x, y));
	await sleep(300);

	if (dx > 0) {
		// mouse move
		for (let i = x; i <= endX; i += rand(10, 20)) {
			user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, MakeLParam(i, y + rand(-5, 5)));
			await sleep(50);
		}
		user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, MakeLParam(endX, endY));
		await sleep(300);
	}
	// mouse up
	user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, MakeLParam(endX, endY));
}
exports.slide = slide;

if (require.main === module) {
	async function main() {
		await sleep(10e3);
		console.log(123);
		await slide({title: "淘宝联盟·生态伙伴", x: 300, y: 200, dx: 0});
	}

	main().catch(console.error);
}