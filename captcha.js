const ffi = require("ffi-napi");
const wchar = require("./common/wchar");
const {sleep} = require("./common/utils");

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

async function slide({x, y, dx}) {
	const wname = "巨量百应Buyin - Google Chrome";
	const hwnd = user32.FindWindowW("Chrome_WidgetWin_1", wname);

	if (hwnd === 0) {
		throw "window not found";
	}
	// 状态栏高度
	y += 122;

	const endX = x + dx;
	const endY = y;
	const step = 10;

	// mouse down
	user32.PostMessageW(hwnd, WM_LBUTTONDOWN, 1, MakeLParam(x, y));
	await sleep(300);

	// mouse move
	for (let i = x; i <= endX; i += step) {
		user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, MakeLParam(i, y));
		await sleep(50);
	}
	user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, MakeLParam(endX, endY));
	await sleep(300);

	// mouse up
	user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, MakeLParam(endX, endY));
}
exports.slide = slide;

if (require.main === module) {
	async function main() {
		await slide({x: 300, y: 200, dx: 20});
	}

	main().catch(console.error);
}
