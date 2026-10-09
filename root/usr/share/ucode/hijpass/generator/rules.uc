import { list, port } from '../uci/config.uc';
import { optional, compact, TAG } from './constants.uc';

// Match 字段均为数组：domain/suffix/keyword/regex 域名条件，ip 为地址或 CIDR，
// geoip/geosite 为 Geo 标签，network/protocol/ports/ranges 为传输限制。
// sets 元素：{type, tag, path|url}，表示本地或远端 sing-box 规则集。
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
				let entry = { type: set[1], tag };
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
}
export function hasDomain(r) { return length(r.domain) + length(r.suffix) + length(r.keyword) + length(r.regex) > 0; }
export function empty(r, geo) {
	return !hasDomain(r) && !length(r.ip) && !length(r.network) && !length(r.protocol)
		&& !length(r.ports) && !length(r.ranges) && !(geo ? length(r.geoip) + length(r.geosite) : length(r.sets));
}
export function convertGeo(r) {
	for (let value in [...r.geosite, ...r.geoip]) {
		let tag = replace(value, ':', '-');
		push(r.sets, { type: 'local', tag, path: `/etc/hijpass/ruleset/${tag}.srs` });
	}
}
export function singboxMatch(r, dnsOnly) {
	let out = {};
	for (let key, values in { domain: r.domain, domain_suffix: r.suffix, domain_keyword: r.keyword, domain_regex: r.regex })
		if (length(values)) out[key] = compact(values);
	if (length(r.sets)) out.rule_set = compact(map(r.sets, s => s.tag));
	if (!dnsOnly) {
		for (let key, values in { ip_cidr: r.ip, network: r.network, protocol: r.protocol, port: r.ports, port_range: r.ranges })
			if (length(values)) out[key] = compact(values);
	}
	return out;
}
export function xrayDomains(r) {
	return [...map(r.domain, d => 'full:' + d), ...map(r.suffix, d => 'domain:' + d), ...r.keyword, ...map(r.regex, d => 'regexp:' + d), ...r.geosite];
}
export function xrayRules(r, name, exit, version) {
	let base = { inboundTag: [TAG.tproxy], outboundTag: exit };
	optional(base, 'ruleTag', name);
	optional(base, 'network', r.network);
	optional(base, 'protocol', r.protocol);
	optional(base, 'port', join(',', [...map(r.ports, p => `${p}`), ...map(r.ranges, p => replace(p, ':', '-'))]));
	let domains = xrayDomains(r);
	let ips = [...filter(r.ip, ip => !version || (index(ip, ':') >= 0 ? version == 6 : version == 4)), ...r.geoip];
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
}
