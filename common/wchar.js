/**
 * Module dependencies.
 */

var ref = require("ref-napi");
var iconv = require("iconv-lite");

/**
 * On Windows they're UTF-16 (2-bytes),
 * but on Unix platform they're UTF-32 (4-bytes).
 *
 * TODO: add a way to optionally enable `-fshort-wchar` for Unix (gcc option).
 */

var size;
if (process.platform == "win32") {
	size = 2;
} else {
	size = 4;
}

var CHARACTER = "UTF-" + 8 * size + ref.endianness;

/**
 * The `wchar_t` type.
 */

exports = module.exports = Object.create(ref.types["int" + 8 * size]);
exports.name = "wchar_t";
exports.size = size;
exports.indirection = 1;
exports.get = function get(buf, offset) {
	if (offset > 0 || buf.length !== exports.size) {
		offset = offset | 0;
		buf = buf.slice(offset, offset + size);
	}
	return exports.toString(buf);
};
exports.set = function set(buf, offset, val) {
	var _buf = val; // assume val is a Buffer by default
	if (typeof val === "string") {
		_buf = iconv.encode(val[0], CHARACTER);
	} else if (typeof val === "number") {
		_buf = iconv.encode(String.fromCharCode(val), CHARACTER);
	} else if (!_buf) {
		throw new TypeError("muss pass a String, Number, or Buffer for `wchar_t`");
	}
	return _buf.copy(buf, offset, 0, size);
};

/**
 * The "wchar_t *" type.
 *
 * We use the "CString" type as a base since it's pretty close to what we
 * actually want. We just have to define custom "get" and "set" functions.
 */

exports.string = Object.create(ref.types.CString);
exports.string.name = "WCString";
exports.string.get = function get(buf, offset) {
	var _buf = buf.readPointer(offset);
	if (_buf.isNull()) {
		return null;
	}
	var stringBuf = _buf.reinterpretUntilZeros(exports.size);
	return exports.toString(stringBuf);
};
exports.string.set = function set(buf, offset, val) {
	var _buf = val; // val is a Buffer? it better be \0 terminated...
	if (typeof val == "string") {
		_buf = iconv.encode(val + "\0", CHARACTER);
	}
	return buf.writePointer(_buf, offset);
};

/**
 * Turns a `wchar_t *` Buffer instance into a JavaScript String instance.
 *
 * @param {Buffer} buffer - buffer instance to serialize
 * @public
 */

exports.toString = function toString(buffer) {
	return iconv.decode(buffer, CHARACTER);
};
