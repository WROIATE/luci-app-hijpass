import * as fs from 'fs';
import { read } from '../uci/read.uc';
import { first } from '../config/sections.uc';
import { list, port } from '../config/values.uc';
import { exec, checked, lines, atomic, temporary } from './system.uc';

// Firewall 的输入仍使用 UCI 字段：proxy_port/shunt_port 为透明代理入口，
// tproxy_proto 为 tcp/udp 列表，dns_forward 为 none/pre-routing/routing；
// proxy_local 控制路由器本机，acl_default_allow 与 MAC/接口列表控制客户端。
// NetworkState：wan 为 WAN 设备名；local4/local6/dns4/dns6 为本地绕过地址数组。
/**
 * @param {object[]} sections
 */
export function networkState(sections) {
	let state = { wan: lines(exec(['fw4', 'zone', 'wan'], true).stdout), local4: [], local6: [], dns4: [], dns6: [] };
	let addresses = exec(['ip', '-j', 'address', 'show'], true);
	let interfaces = exec(['ubus', 'call', 'network.interface', 'dump'], true);
	// 命令的 JSON 解析失败时报告来源；不能用残缺网络状态继续生成绕过规则。
	try {
		if (!addresses.code) for (let iface in json(addresses.stdout)) {
			for (let addr in iface.addr_info || []) push(addr.family == 'inet6' ? state.local6 : state.local4, `${addr.local}/${addr.prefixlen}`);
		}
		if (!interfaces.code) for (let iface in json(interfaces.stdout).interface || []) {
			if (!length(filter(iface.route || [], route => route.mask == 0))) continue;
			for (let name in [iface.device, iface.l3_device]) if (name && name != 'br-lan') push(state.wan, name);
		}
	}
	catch (e) { die(`invalid network state JSON: ${e.message}`); }
	let dhcp = first(read('dhcp'), 'dnsmasq');
	for (let line in lines(fs.readfile(dhcp.resolvfile))) {
		let fields = split(line, /[ \t]+/), address = split(fields[1] || '', '%')[0] || '', bytes = iptoarr(address);
		if (fields[0] != 'nameserver' || !bytes || index(['0.0.0.0', '127.0.0.1', '::', '::1'], address) >= 0) continue;
		push(length(bytes) == 4 ? state.dns4 : state.dns6, address);
	}
	state.wan = uniq(state.wan);
	return state;
};
/**
 * @param {string} path
 * @param {integer} version
 */
function ipList(path, version) {
	return filter(lines(fs.readfile(path)), value => {
		let parts = split(value, '/'), bytes = iptoarr(parts[0] || ''), prefix = parts[1] || '';
		if (!bytes || length(bytes) != (version == 4 ? 4 : 16)) return false;
		return parts[1] == null || match(prefix, /^[0-9]+$/) && int(parts[1]) <= length(bytes) * 8;
	});
}

/**
 * @param {object[]} sections
 * @param {{wan: string[], local4: string[], local6: string[], dns4: string[], dns6: string[]}} state
 * @param {string|null} template
 */
export function generate(sections, state, template) {
	let f = first(sections, 'firewall'), global = first(sections, 'hijpass'), dns = first(sections, 'dns'), shunt = first(sections, 'shunt');
	if (!f.proxy_port && !f.shunt_port) return '';
	// 模板读取失败时停止生成，不能把只有 define、没有规则的文本当成成功。
	if (type(template) != 'string' || !length(template)) die('firewall template is empty or unreadable');
	if (f.proxy_port) port(f.proxy_port);
	if (f.shunt_port) port(f.shunt_port);
	let forward = '';
	if (f.dns_forward == 'pre-routing' && dns.dns_service == 'chinadns-ng') forward = dns.cdg_port;
	if (f.dns_forward == 'routing' && shunt.enabled != '0') forward = shunt.dns_listen_port;
	if (forward) port(forward);
	// 原配置既有 option 'tcp,udp'，也有 list；统一拆成 nft 协议集合。
	let proto = filter(split(join(',', list(f.tproxy_proto)), /[, \t]+/), value => value != '');
	if (!length(proto)) die('tproxy_proto is required');
	for (let value in proto) if (index(['tcp', 'udp'], value) < 0) die('invalid tproxy_proto');
	/** @param {string[]} values */
	function mac(values) {
		for (let value in values) if (!match(value, /^[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){5}$/)) die('invalid proxy MAC');
		return join(', ', values);
	}
	/** @param {string[]} values */
	function interfaces(values) {
		for (let value in values) if (!match(value, /^[A-Za-z0-9_.:@-]+$/)) die('invalid proxy interface');
		return join(', ', map(values, v => sprintf('%J', v)));
	}
	let definitions = {
		DNS_FORWARD_PORT: forward || '', HIJPASS_USER: 'hijpass', TPROXY_MARK: '0x1', TPROXY_SHUNT_MARK: '0x3',
		TPROXY_PORT: f.proxy_port || '', TPROXY_SHUNT_PORT: f.shunt_port || '', TPROXY_PROTO: `{ ${join(', ', proto)} }`,
		WAN_DEV: `{ ${join(', ', map(state.wan, v => sprintf('%J', v)))} }`,
		PROXY_INTERFACE: `{ ${interfaces(list(f.proxy_iface_list))} }`, PROXY_INTERFACE_EXCLUDE: `{ ${interfaces(list(f.proxy_iface_exclude_list))} }`,
		PROXY_MAC: `{ ${mac(list(f.proxy_mac_list))} }`, PROXY_MAC_EXCLUDE: `{ ${mac(list(f.proxy_mac_exclude_list))} }`,
	};
	for (let version in [4, 6]) {
		definitions[`IP${version}_DIRECT_NFT_LIST`] = `{ ${join(', ', uniq([...state[`dns${version}`], ...state[`local${version}`], ...ipList(global.ip_direct, version)]))} }`;
		definitions[`IP${version}_PROXY_NFT_LIST`] = `{ ${join(', ', uniq(ipList(global.ip_proxy, version)))} }`;
		definitions[`IP${version}_CHNROUTE_LIST`] = `{ ${join(', ', f.use_chnroute == '1' ? uniq(ipList(version == 4 ? global.chn_route : global.chn_route6, version)) : [])} }`;
	}
	let disabled = {};
	if (!forward) disabled['dns-forward'] = true;
	if (!forward || f.proxy_local != '1') disabled['dns-forward-output'] = true;
	if (f.proxy_local != '1') disabled['out-route'] = true;
	for (let version in [4, 6]) {
		if (f.use_chnroute != '1') disabled[`chnroute${version}list`] = true;
		if (dns.use_gfw != '1') disabled[`gfw${version}list`] = true;
		if (dns.use_chn != '1') disabled[`chn${version}list`] = true;
		if (dns.dns_service == 'custom') { disabled[`dnsproxy${version}list`] = true; disabled[`dnsbypass${version}list`] = true; }
	}
	if (f.acl_default_allow == '1') {
		disabled.proxy_mac_list = true; disabled.proxy_interface_list = true;
		if (!length(list(f.proxy_mac_exclude_list))) disabled.proxy_mac_exclude_list = true;
		if (!length(list(f.proxy_iface_exclude_list))) disabled.proxy_interface_exclude_list = true;
	}
	else { disabled.proxy_mac_exclude_list = true; disabled.proxy_interface_exclude_list = true; }
	let result = [], skip = false;
	// 模板按完整 chain/set 删除；引用已删除集合的规则同时移除，不留下悬空引用。
	let templateLines = split(template, '\n');
	for (let i = 0; i < length(templateLines); i++) {
		let line = templateLines[i] || '';
		let block = match(line, /^    (chain|set) ([A-Za-z0-9_-]+) \{/);
		if (block) skip = !!disabled[block[2]];
		if (skip) { if (match(line, /^    \}/)) skip = false; continue; }
		// 空集合要保留声明供 DNS 动态写入，但不要嵌套 elements = { $EMPTY }。
		// 部分 nft 版本会在展开这个空集合时崩溃；省略 elements 即表示空集合。
		if (match(line, /^        elements = \{$/)) {
			let macro = match(templateLines[i + 1] || '', /^[ \t]*[$]([A-Z0-9_]+)[ \t]*$/);
			if (macro && match(definitions[macro[1]] || '', /^\{[ \t]*\}$/) && match(templateLines[i + 2] || '', /^        \}$/)) { i += 2; continue; }
		}
		if (length(filter(keys(disabled), name => index(line, '@' + name) >= 0))) continue;
		if (!length(state.wan) && index(line, '$WAN_DEV') >= 0) continue;
		if (!f.proxy_port && index(line, '$TPROXY_PORT') >= 0) continue;
		if (!f.shunt_port && (index(line, '$TPROXY_SHUNT_PORT') >= 0 || index(line, 'shunt mark') >= 0 || match(line, /@(chnroute|chn)[46]list/))) continue;
		push(result, line);
	}
	// 未启用的端口没有值，不能输出空的 nft define（即使模板已不引用它）。
	return join('\n', map(filter(keys(definitions), key => definitions[key] != ''), key => `define ${key} = ${definitions[key]}`)) + '\n\n' + join('\n', result) + '\n';
};
const RULES = '/etc/hijpass/fw4-rules.nft';
/**
 * @param {object[]} sections
 */
export function reset(sections) {
	let text = generate(sections, networkState(sections), fs.readfile(first(sections, 'hijpass').nft || '/etc/hijpass/fw4-template.nft'));
	if (!text) { fs.unlink(RULES); checked(['fw4', 'reload']); return; }
	let temp = temporary(RULES);
	try {
		atomic(temp, text);
		checked(['nft', '-c', '-f', temp]);
		if (!fs.rename(temp, RULES)) die(`cannot replace ${RULES}`);
		checked(['fw4', 'reload']);
	}
	catch (e) { fs.unlink(temp); die(e.message); }
};
export function remove() { fs.unlink(RULES); checked(['fw4', 'reload']); };
/**
 * @param {object[]} sections
 */
export function apply(sections) {
	if (!exec(['nft', 'list', 'table', 'inet', 'hijpass'], true).code) checked(['nft', 'delete', 'table', 'inet', 'hijpass']);
	if (!fs.access(RULES)) return;
	checked(['nft', '-f', RULES]);
	let hook = first(sections, 'hijpass').nft_hook;
	if (hook && fs.access(hook, 'x')) checked([hook]);
};

/**
 * @param {string} action
 */
export function route(action) {
	const table = '233', mark = '0x1';
	if (index(['reset_hijpass_route', 'remove_hijpass_route'], action) < 0) die('unknown route action');
	// 使用固定表号，无需增删共享 rt_tables 文件；仅清理 Hijpass 自己的标记规则。
	for (let family in [[], ['-6']]) {
		while (!exec(['ip', ...family, 'rule', 'del', 'fwmark', mark, 'table', table], true).code) {}
		exec(['ip', ...family, 'route', 'del', 'local', 'default', 'dev', 'lo', 'table', table], true);
		if (action == 'reset_hijpass_route') {
			checked(['ip', ...family, 'route', 'add', 'local', 'default', 'dev', 'lo', 'table', table]);
			checked(['ip', ...family, 'rule', 'add', 'fwmark', mark, 'table', table]);
		}
	}
};
