const cv = require("opencv4nodejs");

async function slideDx(back, slide) {
	console.log({back, slide});
	let origin = await cv.imdecodeAsync(back);
	// await cv.imwriteAsync("dist/origin.png", origin);
	let image = origin.bgrToGray();
	image = image.canny(200, 200);
	let template = await cv.imdecodeAsync(slide);
	// await cv.imwriteAsync("dist/template.png", template);
	template = template.bgrToGray();
	template = template.canny(200, 200);

	const matched = image.matchTemplate(template, 5);
	const minMax = matched.minMaxLoc();
	console.log(minMax.maxVal, minMax.maxLoc.x, minMax.maxLoc.y);

	return minMax.maxLoc.x;
}
exports.slideDx = slideDx;

if (require.main === module) {
	async function main() {
		// Load images
		let origin = await cv.imreadAsync("dist/origin.png");
		let image = origin.bgrToGray();
		image = image.canny(200, 200);
		let template = await cv.imreadAsync("dist/template.png");
		template = template.bgrToGray();
		template = template.canny(200, 200);

		// Match template (the brightest locations indicate the highest match)
		const matched = image.matchTemplate(template, 5);

		// Use minMaxLoc to locate the highest value (or lower, depending of the type of matching method)
		const minMax = matched.minMaxLoc();
		const {
			maxLoc: {x, y},
		} = minMax;

		// Draw bounding rectangle
		origin.drawRectangle(
			new cv.Rect(x, y, template.cols, template.rows),
			new cv.Vec(0, 255, 0),
			2,
			cv.LINE_8
		);

		console.log(minMax.minVal, minMax.minLoc.x, minMax.minLoc.y);
		// Open result in new window
		cv.imshow("We've found Waldo!", origin);
		cv.waitKey();
	}

	main().catch(console.error);
}
