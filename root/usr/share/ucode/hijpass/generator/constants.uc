// 输出标签与 UCI 的用户节点名称分开，避免直接出口、DNS 和真实节点混淆。
export const TAG = {
	direct: 'direct-out', block: 'block', dns: 'dns-out',
	tproxy: 'tproxy-in', socks: 'socks-in', dnsInbound: 'dns-in',
	upstream: 'upstream-', balance: 'slb', member: 'lb-member-',
	ruleset: 'ruleset-out', rulesetDNS: 'ruleset-dns-resolver',
};
export const CORE = { singbox: 'sing-box', xray: 'xray', custom: 'custom' };
export function core(value) { return value == 'singbox' ? CORE.singbox : value; };

// sing-box 的 Listable 字段允许单值和数组；只有多个元素时才输出数组。
export function compact(values) { return length(values) == 1 ? values[0] : values; };
export function optional(object, key, value) {
	if (value != null && value !== '' && value !== false && value !== 0 && (type(value) != 'array' || length(value)))
		object[key] = value;
	return object;
};
