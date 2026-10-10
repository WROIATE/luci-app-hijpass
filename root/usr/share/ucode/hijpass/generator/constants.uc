// 输出标签与 UCI 的用户节点名称分开，避免直接出口、DNS 和真实节点混淆。
export const TAG = {
	direct: 'direct-out', block: 'block', dns: 'dns-out',
	tproxy: 'tproxy-in', socks: 'socks-in', dnsInbound: 'dns-in',
	upstream: 'upstream-', balance: 'slb', member: 'lb-member-',
	ruleset: 'ruleset-out', rulesetDNS: 'ruleset-dns-resolver',
};

export function optional(object, key, value) {
	// 未设置与明确设置 false/0 不同；只省略空值，与 TS 的 JsonUtils 一致。
	if (value != null && value !== '' && (type(value) != 'array' || length(value)))
		object[key] = value;
	return object;
};

// 对应 TS 的 omitEmptyReplacer：清理空字符串、空数组和 null，保留 false/0 和空对象。
// 在生成完成后统一处理，协议实现不必为了 JSON 输出重复判断每一个可选字段。
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
