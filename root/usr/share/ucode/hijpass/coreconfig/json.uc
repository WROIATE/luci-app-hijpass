/** @typedef {import('../types/json.uc').JsonObject} JsonObject */
// JSON 输出辅助：按需添加字段，并按原 TS 规则清理空值。
/**
 * 仅在值已设置时向对象添加可选字段，保留 false 和 0。
 * @param {JsonObject} object
 * @param {string} key
 * @param {object|array|string|number|boolean|null} value
 * @returns {JsonObject} 传入的原对象，可能已被修改。
 */
export function optional(object, key, value) {
	// 未设置与明确设置 false/0 不同；只省略空值，与 TS 的 JsonUtils 一致。
	if (value != null && value !== '' && (type(value) != 'array' || length(value))) {
		object[key] = value;
	}
	return object;
};

// 对应 TS 的 omitEmptyReplacer：清理空字符串、空数组和 null，保留 false/0 和空对象。
// 在生成完成后统一处理，协议实现不必为了 JSON 输出重复判断每一个可选字段。
/**
 * 递归清理 JSON 空值，保留 false、0 和空对象。
 * @param {object|array|string|number|boolean|null} value
 * @returns {object|array|string|number|boolean|null} 清理后的值；对象和数组生成副本，空白字符串和空数组转为 null。
 */
export function clean(value) {
	if (type(value) == 'array') {
		return length(value) ? map(value, clean) : null;
	}
	if (type(value) == 'string' && !length(trim(value))) {
		return null;
	}
	if (type(value) != 'object') {
		return value;
	}
	let result = {};
	for (let key, item in value) {
		let output = clean(item);
		if (output != null) {
			result[key] = output;
		}
	}
	return result;
};
