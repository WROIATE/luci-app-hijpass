// JSON 输出辅助：按需添加字段，并按原 TS 规则清理空值。
/** @returns {object} 传入的原对象引用；value 非空时原地写入 key，false/0 仍会写入。 */
export function optional(object, key, value) {
	// 未设置与明确设置 false/0 不同；只省略空值，与 TS 的 JsonUtils 一致。
	if (value != null && value !== '' && (type(value) != 'array' || length(value)))
		object[key] = value;
	return object;
};

// 对应 TS 的 omitEmptyReplacer：清理空字符串、空数组和 null，保留 false/0 和空对象。
// 在生成完成后统一处理，协议实现不必为了 JSON 输出重复判断每一个可选字段。
/** @returns {object|array|string|number|boolean|null} 清理后的 JSON 值；对象/数组递归生成副本，空字符串/空数组变为 null，保留 false/0 和空对象。 */
export function clean(value) {
	if (type(value) == 'array') return length(value) ? map(value, clean) : null;
	if (type(value) == 'string' && !length(trim(value))) return null;
	if (type(value) != 'object') return value;
	let result = {};
	for (let key, item in value) {
		let output = clean(item);
		if (output != null) result[key] = output;
	}
	return result;
};
