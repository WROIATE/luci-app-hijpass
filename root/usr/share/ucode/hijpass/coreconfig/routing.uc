import { of, first } from '../config/sections.uc';
import { port } from '../config/values.uc';
import { CORE, core } from '../config/protocol/proxy.uc';
import { TAG } from './constants.uc';
import { parse } from './rules.uc';
import { build as buildSingbox } from './singbox/routing.uc';
import { build as buildXray } from './xray/routing.uc';

// Routing：core/listen/dnsPort/log/strategy/cache/convert 为模板选项，
// final/rulesetExit 为已解析出口标签；dns/rulesetDNS 为服务器对象，entries 为规则数组。
// DNSServer：tag（名称）、type（传输）、address、port（null 表示未设置）。
// Entry：name/split，exit/v4/v6/dnsExit 出口，dns/strategy DNS 策略，match 匹配条件。
/**
 * 解析分流设置，确认代理出口和 DNS 引用有效。
 * @param {object[]} sections
 * @param {{nodes: object[], byName: object}} dependencies
 * @returns {object} 带出口、DNS、规则集策略和 entries 的分流设置对象。
 */
export function prepare(sections, dependencies) {
	/**
	 * 将出口选择转换为节点名称或直连、阻断标签。
	 * @returns {string} 出口标签；可选项未设置时为空字符串，无效引用抛错。
	 */
	function resolveOutboundTag(name, required) {
		if (!name && !required) {
			return '';
		}
		if (name == 'hijpass-direct') {
			return TAG.direct;
		}
		if (name == 'hijpass-block') {
			return TAG.block;
		}
		if (dependencies.byName[name]) {
			return name;
		}
		die(name ? `proxy node "${name}" missing or disabled` : 'proxy exit is required');
	}
	let servers = {};
	for (let section in of(sections, 'shunt_dns_node')) {
		if (section.enabled == '0') {
			continue;
		}
		if (servers[section.tag]) {
			die(`duplicate DNS tag "${section.tag}"`);
		}
		servers[section.tag] = { tag: section.tag, type: section.type, address: section.server, port: section.port ? port(section.port) : null };
	}
	/**
	 * 查找已启用的 DNS 节点，无效引用时报错。
	 * 返回：节点对象 {tag, type, address, port}；端口未配置时 port 为 null。
	 */
	function resolveDNSServer(name) {
		if (!servers[name]) {
			die(`DNS node "${name}" missing or disabled`);
		}
		return servers[name];
	}
	let shunt = first(sections, 'shunt');
	let settings = {
		core: core(shunt.type), listen: port(shunt.shunt_listen_port), dnsPort: port(shunt.dns_listen_port),
		log: shunt.log_level || 'info', strategy: shunt.default_strategy || '64', cache: shunt.use_cache == '1',
		convert: shunt.ruleset_convert == '1', final: resolveOutboundTag(shunt.default_proxy_node, true), dns: resolveDNSServer(shunt.default_dns_node),
		rulesetExit: resolveOutboundTag(shunt.ruleset_out_node, false), rulesetDNS: null, entries: [],
	};
	if (settings.core != CORE.singbox && settings.core != CORE.xray) {
		die(`unsupported shunt core "${settings.core}"`);
	}
	if (settings.final == TAG.block) {
		die('default DNS exit cannot be Block');
	}
	if (settings.core == CORE.singbox && settings.rulesetExit) {
		if (settings.rulesetExit == TAG.block) {
			die('rule-set download exit cannot be Block');
		}
		if (shunt.ruleset_dns_node) {
			settings.rulesetDNS = resolveDNSServer(shunt.ruleset_dns_node);
		}
	}
	for (let rule in of(sections, 'shunt_route_rule')) {
		if (rule.enabled != '1') {
			continue;
		}
		let split = rule.ip_version_split == '1';
		if (split && !rule.proxy_node_v4 && !rule.proxy_node_v6) {
			die(`split rule "${rule.name}" requires a proxy exit`);
		}
		push(settings.entries, {
			name: rule.name || '', split,
			exit: split ? '' : resolveOutboundTag(rule.proxy_node, true),
			v4: split ? resolveOutboundTag(rule.proxy_node_v4, false) : '', v6: split ? resolveOutboundTag(rule.proxy_node_v6, false) : '',
			dnsExit: resolveOutboundTag(rule.dns_proxy_node, false), dns: rule.dns_node ? resolveDNSServer(rule.dns_node) : settings.dns,
			strategy: rule.dns_strategy || '', match: parse(rule),
		});
	}
	return settings;
};

/**
 * 将共享分流设置交给对应核心的生成器。
 * @returns {object} 完整核心配置；不修改 settings 或 dependencies。
 */
export function build(settings, dependencies) {
	return settings.core == CORE.singbox ? buildSingbox(settings, dependencies) : buildXray(settings, dependencies);
};
