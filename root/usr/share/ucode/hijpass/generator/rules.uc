import { list, port } from '../uci/config.uc';
import { optional, TAG } from './constants.uc';

// Match 字段均为数组：domain/suffix/keyword/regex 域名条件，ip 为地址或 CIDR，
// geoip/geosite 为 Geo 标签，network/protocol/ports/ranges 为传输限制。
// sets 元素：{type, tag, path|url}，表示本地或远端 sing-box 规则集。
/**
 * @typedef {object} Match
 * @property {string[]} domain 完整域名。
 * @property {string[]} suffix 域名后缀。
 * @property {string[]} keyword 域名关键字。
 * @property {string[]} regex 域名正则表达式。
 * @property {string[]} ip IP 或 CIDR。
 * @property {string[]} geoip GeoIP 标签。
 * @property {string[]} geosite GeoSite 标签。
 * @property {object[]} sets 本地或远端规则集。
 * @property {string[]} network 传输层协议。
 * @property {string[]} protocol 应用层协议。
 * @property {integer[]} ports 目标端口。
 * @property {string[]} ranges 目标端口范围，使用冒号分隔。
 */
/**
 * @param {object} section UCI shunt_route_rule。
 * @returns {Match}
 */
export function parse(section) {
	let r = {
		domain: [], suffix: [], keyword: [], regex: [], ip: [], geoip: [], geosite: [], sets: [],
		network: list(section.network), protocol: list(section.protocol),
		ports: map(list(section.port), p => port(p)), ranges: map(list(section.port_range), p => replace(p, '-', ':')),
	};
	for (let key in ['domain_list', 'ip_list']) {
		for (let line in split(section[key] || '', '\n')) {
			line = trim(line);
			if (!line || substr(line, 0, 1) == '#') continue;
			let set = match(line, /^rule-set:(local|remote):(.*)$/);
			if (set) {
				let filename = split(set[2], '/')[-1];
				let tag = replace(filename, /[.][^.]*$/, '');
				// source JSON 与 binary SRS 必须明确区分，不能使用核心的 binary 默认值。
				let entry = { type: set[1], tag, format: match(set[2], /srs$/) ? 'binary' : 'source' };
				entry[set[1] == 'remote' ? 'url' : 'path'] = set[2];
				push(r.sets, entry);
				continue;
			}
			if (key == 'ip_list') push(substr(line, 0, 6) == 'geoip:' ? r.geoip : r.ip, line);
			else {
				let prefix = match(line, /^(full|domain|regexp|geosite):(.*)$/);
				if (!prefix) push(r.keyword, line);
				else push(r[{ full: 'domain', domain: 'suffix', regexp: 'regex', geosite: 'geosite' }[prefix[1]]], prefix[1] == 'geosite' ? line : prefix[2]);
			}
		}
	}
	return r;
};
/** @param {Match} r */
export function hasDomain(r) { return length(r.domain) + length(r.suffix) + length(r.keyword) + length(r.regex) > 0; };
/**
 * @param {Match} r
 * @param {boolean} geo 是否按 Xray Geo 标签判断匹配条件。
 */
export function empty(r, geo) {
	return !hasDomain(r) && !length(r.ip) && !length(r.network) && !length(r.protocol)
		&& !length(r.ports) && !length(r.ranges) && !(geo ? length(r.geoip) + length(r.geosite) : length(r.sets));
};
/** @param {Match} r */
export function convertGeo(r) {
	for (let value in [...r.geosite, ...r.geoip]) {
		let tag = replace(value, ':', '-');
		push(r.sets, { type: 'local', tag, format: 'binary', path: `/etc/hijpass/ruleset/${tag}.srs` });
	}
};
/**
 * @param {Match} r
 * @param {boolean} dnsOnly
 */
export function singboxMatch(r, dnsOnly) {
	let out = {};
	for (let key, values in { domain: r.domain, domain_suffix: r.suffix, domain_keyword: r.keyword, domain_regex: r.regex })
		if (length(values)) out[key] = values;
	if (length(r.sets)) out.rule_set = map(r.sets, s => s.tag);
	if (!dnsOnly) {
		for (let key, values in { ip_cidr: r.ip, network: r.network, protocol: r.protocol, port: r.ports, port_range: r.ranges })
			if (length(values)) out[key] = values;
	}
	return out;
};
/** @param {Match} r */
export function xrayDomains(r) {
	return [...map(r.domain, d => 'full:' + d), ...map(r.suffix, d => 'domain:' + d), ...r.keyword, ...map(r.regex, d => 'regexp:' + d), ...r.geosite];
};
/**
 * @param {Match} r
 * @param {string} name
 * @param {string} exit
 * @param {integer} version 0 表示不限制地址族，4/6 表示 IPv4/IPv6。
 */
export function xrayRules(r, name, exit, version) {
	let base = { inboundTag: [TAG.tproxy], outboundTag: exit };
	optional(base, 'ruleTag', name);
	optional(base, 'network', r.network);
	optional(base, 'protocol', r.protocol);
	optional(base, 'port', join(',', [...map(r.ports, p => `${p}`), ...map(r.ranges, p => replace(p, ':', '-'))]));
	let domains = xrayDomains(r);
	let ips = [...filter(r.ip, ip => {
		if (!version) return true;
		let value = replace(ip, /^!/, '');
		// ext: 文件规则和 geoip: 标签可能同时包含 IPv4/IPv6；冒号并不总是 IPv6 地址。
		if (match(value, /^(ext|geoip):/)) return true;
		if (index(value, ':') >= 0) return version == 6;
		return match(value, /^[0-9]{1,3}([.][0-9]{1,3}){3}(\/[0-9]+)?$/) ? version == 4 : true;
	}), ...r.geoip];
	let family = version == 4 ? '0.0.0.0/0' : version == 6 ? '::/0' : null;
	let result = [];
	// Xray 的域名和 IP 条件分成两条规则，避免在单条规则中意外变成 AND。
	if (length(domains)) {
		let rule = { ...base, domain: domains };
		if (family) rule.ip = [family];
		push(result, rule);
	}
	if (length(ips)) push(result, { ...base, ip: ips });
	if (!length(result)) {
		if (family) base.ip = [family];
		push(result, base);
	}
	return result;
};
