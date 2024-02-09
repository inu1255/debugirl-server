function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.sleep = sleep;

function formatError(obj) {
	if (obj && typeof obj === "object") {
		if (typeof obj.msg === "string") return obj.msg;
		if (typeof obj.message === "string") return obj.message;
		if (typeof obj.error === "string") return obj.error;
		for (let k in obj) {
			let v = obj[k];
			if (typeof v === "string") return v;
		}
		for (let k in obj) {
			let v = obj[k];
			if (v && typeof v === "object") return formatError(v);
		}
	}
	return obj + "";
}
exports.formatError = formatError;

function datetime(t) {
	t = t ? new Date(t) : new Date();
	let year = t.getFullYear().toString();
	var month = (t.getMonth() + 1).toString();
	if (month.length < 2) month = "0" + month;
	var date = t.getDate().toString();
	if (date.length < 2) date = "0" + date;
	var hours = t.getHours().toString();
	if (hours.length < 2) hours = "0" + hours;
	var mintues = t.getMinutes().toString();
	if (mintues.length < 2) mintues = "0" + mintues;
	var seconds = t.getSeconds().toString();
	if (seconds.length < 2) seconds = "0" + seconds;
	return `${year}-${month}-${date} ${hours}:${mintues}:${seconds}`;
}
exports.datetime = datetime;

/**
 * 将data编码为URL的query参数
 * @param {{[key:string]:any}} data 要编码的数据。
 * @param {number} [limit] 限制过大的参数
 * @returns {string} 编码后的字符串
 * @example
 * encodeQuery({a: 1, b: 2}) // a=1&b=2
 */
function encodeQuery(data, limit) {
	var ss = [];
	for (var k in data) {
		var v = data[k];
		if (v == null || typeof v === "function") continue;
		if (v === false) v = "";
		if (typeof v === "object") v = JSON.stringify(v);
		else v = v.toString();
		if (v.length > limit) continue;
		ss.push(encodeURI(k) + "=" + encodeURI(v));
	}
	return ss.join("&");
}
exports.encodeQuery = encodeQuery;
