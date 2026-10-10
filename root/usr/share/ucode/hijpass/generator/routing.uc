import { of, first, port } from '../uci/config.uc';
import { TAG, CORE, core, optional } from './constants.uc';
import { parse, hasDomain, empty, convertGeo, singboxMatch, xrayDomains, xrayRules } from './rules.uc';
import * as sb from './singbox/config.uc';
import * as xr from './xray/config.uc';

// Routing：core/listen/dnsPort/log/strategy/cache/convert 为模板选项，
// final/rulesetExit 为已解析出口标签；dns/rulesetDNS 为服务器对象，entries 为规则数组。
// DNSServer：tag（名称）、type（传输）、address、port（null 表示未设置）。
// Entry：name/split，exit/v4/v6/dnsExit 出口，dns/strategy DNS 策略，match 匹配条件。
/**
 * @param {object[]} sections
 * @param {{nodes: object[], byName: object}} graph
 */
export function prepare(sections, graph) {
	function exit(name, required) {
		if (!name && !required) return '';
		if (name == 'hijpass-direct') return TAG.direct;
		if (name == 'hijpass-block') return TAG.block;
		if (graph.byName[name]) return name;
		die(name ? `proxy node "${name}" missing or disabled` : 'proxy exit is required');
	}
	let servers = {};
	for (let s in of(sections, 'shunt_dns_node')) {
		if (s.enabled == '0') continue;
		if (servers[s.tag]) die(`duplicate DNS tag "${s.tag}"`);
		servers[s.tag] = { tag: s.tag, type: s.type, address: s.server, port: s.port ? port(s.port) : null };
	}
	function server(name) {
		if (!servers[name]) die(`DNS node "${name}" missing or disabled`);
		return servers[name];
	}
	let s = first(sections, 'shunt');
	let settings = {
		core: core(s.type), listen: port(s.shunt_listen_port), dnsPort: port(s.dns_listen_port),
		log: s.log_level || 'info', strategy: s.default_strategy || '64', cache: s.use_cache == '1',
		convert: s.ruleset_convert == '1', final: exit(s.default_proxy_node, true), dns: server(s.default_dns_node),
		rulesetExit: exit(s.ruleset_out_node, false), rulesetDNS: null, entries: [],
	};
	if (settings.core != CORE.singbox && settings.core != CORE.xray) die(`unsupported shunt core "${settings.core}"`);
	if (settings.final == TAG.block) die('default DNS exit cannot be Block');
	if (settings.core == CORE.singbox && settings.rulesetExit) {
		if (settings.rulesetExit == TAG.block) die('rule-set download exit cannot be Block');
		if (s.ruleset_dns_node) settings.rulesetDNS = server(s.ruleset_dns_node);
	}
	for (let r in of(sections, 'shunt_route_rule')) {
		if (r.enabled != '1') continue;
		let split = r.ip_version_split == '1';
		if (split && !r.proxy_node_v4 && !r.proxy_node_v6) die(`split rule "${r.name}" requires a proxy exit`);
		push(settings.entries, {
			name: r.name || '', split,
			exit: split ? '' : exit(r.proxy_node, true),
			v4: split ? exit(r.proxy_node_v4, false) : '', v6: split ? exit(r.proxy_node_v6, false) : '',
			dnsExit: exit(r.dns_proxy_node, false), dns: r.dns_node ? server(r.dns_node) : settings.dns,
			strategy: r.dns_strategy || '', match: parse(r),
		});
	}
	return settings;
};
/**
 * @param {string} value
 * @param {boolean} singbox
 */
function strategy(value, singbox) {
	return (singbox ? { '4': 'ipv4_only', '6': 'ipv6_only', '46': 'prefer_ipv4', '64': 'prefer_ipv6' }
		: { '4': 'UseIPv4', '6': 'UseIPv6', '46': 'UseIP', '64': 'UseIP' })[value] || '';
}
/**
 * @param {{tag: string, type: string, address: string, port: integer|null}} s 已解析的 DNS 节点。
 * @param {string} tag
 * @param {string} detour
 * @param {boolean} singbox
 */
function dnsServer(s, tag, detour, singbox) {
	if (singbox) {
		if (index(['udp', 'tcp', 'tls', 'quic', 'https', 'local'], s.type) < 0) die(`invalid sing-box DNS type "${s.type}"`);
		let out = { type: s.type, tag };
		if (s.type != 'local') {
			out.server = s.address;
			optional(out, 'server_port', s.port);
			if (detour != TAG.direct) optional(out, 'detour', detour);
		}
		return out;
	}
	if (index(['udp', 'tcp', 'quic', 'https'], s.type) < 0) die(`invalid Xray DNS type "${s.type}"`);
	let address = s.address, out = { tag, skipFallback: true };
	if (s.type == 'https') address = 'https://' + (index(address, ':') >= 0 ? `[${address}]` : address) + (s.port ? `:${s.port}` : '') + '/dns-query';
	else {
		if (s.type != 'udp') address = `${s.type}://${address}`;
		optional(out, 'port', s.port);
	}
	out.address = address;
	return out;
}

/**
 * @param {object} settings
 * @param {{nodes: object[], byName: object}} graph
 */
export function build(settings, graph) {
	let s = settings, singbox = s.core == CORE.singbox, config = {};
	let dnsServers = [], dnsRules = [], routeRules = [], outbounds = [];
	if (singbox) {
		push(dnsServers, dnsServer(s.dns, s.dns.tag, s.final, true));
		outbounds = [{ type: 'direct', tag: TAG.direct }, ...map(graph.nodes, n => sb.socks(n.name, n.socks_port))];
		routeRules = [{ action: 'sniff' }, { protocol: ['dns'], action: 'hijack-dns' }];
		config = {
			log: { disabled: false, level: s.log, timestamp: true },
			dns: { servers: dnsServers, final: s.dns.tag,
				disable_cache: !s.cache, disable_expire: !s.cache },
			inbounds: [sb.inbound('tproxy', TAG.tproxy, s.listen, '::'), sb.inbound('direct', TAG.dnsInbound, s.dnsPort, '::')],
			outbounds,
			route: { rules: routeRules, final: s.final, default_domain_resolver: s.dns.tag },
		};
		optional(config.dns, 'strategy', strategy(s.strategy, true));
		if (s.rulesetExit) {
			let out = s.rulesetExit == TAG.direct ? { type: 'direct', tag: TAG.ruleset } : sb.socks(TAG.ruleset, graph.byName[s.rulesetExit].socks_port);
			if (s.rulesetDNS) {
				out.domain_resolver = TAG.rulesetDNS;
				push(dnsServers, dnsServer(s.rulesetDNS, TAG.rulesetDNS, TAG.ruleset, true));
			}
			push(outbounds, out);
		}
	}
	else {
		outbounds = map(graph.nodes, n => xr.socks(n.name, n.socks_port));
		push(outbounds, { protocol: 'freedom', tag: TAG.direct, settings: {}, streamSettings: { sockopt: { domainStrategy: 'UseIP' } } });
		// Xray 的默认出口由第一项决定，稳定保持其余出口的原顺序。
		let final = filter(outbounds, o => o.tag == s.final)[0];
		outbounds = [final, ...filter(outbounds, o => o != final)];
		push(outbounds, { protocol: 'blackhole', tag: TAG.block }, {
			protocol: 'dns', tag: TAG.dns, settings: { rules: [{ action: 'hijack', qType: '1,28' }, { action: 'return', rCode: 5 }] },
		});
		config = {
			log: xr.log(s.log), outbounds,
			inbounds: [xr.inbound('tproxy', TAG.tproxy, s.listen, true), xr.inbound('direct', TAG.dnsInbound, s.dnsPort)],
			routing: { domainStrategy: 'AsIs', rules: [] },
			dns: { servers: dnsServers, queryStrategy: strategy(s.strategy, false) || 'UseIP', serveExpiredTTL: 3600,
				disableCache: !s.cache, serveStale: !s.cache, disableFallback: false, disableFallbackIfMatch: true },
		};
	}
	let routes = [], dnsExits = {}, exitOrder = [], sets = {}, setOrder = [];
	function addDNS(entry, r, exit) {
		if (exit == TAG.block) die(`rule "${entry.name}" DNS exit cannot be Block`);
		let tag = entry.name + '-dns', server = dnsServer(entry.dns, tag, exit, singbox);
		push(dnsServers, server);
		if (singbox) {
			let rule = { ...singboxMatch(r, true), action: 'route', server: tag, disable_cache: true };
			optional(rule, 'strategy', strategy(entry.strategy, true));
			push(dnsRules, rule);
		}
		else {
			optional(server, 'domains', xrayDomains(r));
			optional(server, 'queryStrategy', strategy(entry.strategy, false));
			if (!dnsExits[exit]) { dnsExits[exit] = []; push(exitOrder, exit); }
			dnsExits[exit] = [...dnsExits[exit], tag];
		}
	}
	for (let entry in s.entries) {
		let splitMatch = null;
		// 与 TS 的 getRouteRuleVariants 一致：只为已选择出口的地址族创建规则。
		let versions = entry.split ? filter([4, 6], v => v == 4 ? entry.v4 : entry.v6) : [0];
		for (let version in versions) {
			let r = { ...entry.match, sets: [...entry.match.sets] };
			let name = entry.name + (version && entry.name ? `-ipv${version}` : '');
			let exit = version == 4 ? entry.v4 : version == 6 ? entry.v6 : entry.exit;
			// Xray 原生处理 GeoSite；sing-box 仅在启用转换时将其视为域名条件。
			let hasDNS = hasDomain(r, !singbox || s.convert) || singbox && length(r.sets) > 0;
			if (singbox) {
				if (s.convert) convertGeo(r);
				else if (length(r.geoip) + length(r.geosite) && !hasDomain(r) && !length(r.ip) && !length(r.sets)) continue;
				if (empty(r, false)) continue;
				for (let set in r.sets) {
					let value = { ...set };
					if (value.type == 'remote' && s.rulesetExit) value.http_client = { detour: TAG.ruleset };
					if (!sets[set.tag]) push(setOrder, set.tag);
					sets[set.tag] = value;
				}
				let rule = singboxMatch(r, false);
				if (version) rule.ip_version = version;
				if (exit == TAG.block) rule.action = 'reject';
				else { rule.action = 'route'; rule.outbound = exit; }
				push(routeRules, rule);
			}
			else {
				if (empty(r, true) || length(r.sets) && !hasDomain(r) && !length(r.ip) && !length(r.geosite) && !length(r.geoip)) continue;
				for (let proto in r.protocol) if (index(['http', 'tls', 'quic', 'bittorrent'], proto) < 0) die(`unsupported Xray route protocol "${proto}"`);
				push(routes, ...xrayRules(r, name, exit, version));
			}
			if (exit == TAG.block) continue;
			if (entry.split) {
				if (hasDNS && !splitMatch) splitMatch = r;
			}
			else if (hasDNS || singbox && (length(r.ip) + length(r.sets))) addDNS(entry, r, entry.dnsExit || exit);
		}
		// IPv4/IPv6 两条路由共用一条 DNS 策略，必须明确指定 DNS 请求走哪个出口。
		if (splitMatch) {
			if (!entry.dnsExit) die(`split rule "${entry.name}" requires a DNS exit`);
			addDNS(entry, splitMatch, entry.dnsExit);
		}
	}
	if (singbox) {
		if (length(dnsRules)) config.dns.rules = dnsRules;
		if (length(setOrder)) config.route.rule_set = map(setOrder, tag => sets[tag]);
	}
	else {
		let server = dnsServer(s.dns, 'default-dns', '', false);
		server.skipFallback = false;
		push(dnsServers, server);
		routeRules = [{ inboundTag: [TAG.dnsInbound], outboundTag: TAG.dns }];
		config.routing.rules = routeRules;
		for (let exit in exitOrder) push(routeRules, { inboundTag: dnsExits[exit], outboundTag: exit });
		push(routeRules, ...routes);
	}
	return config;
};
