import * as fs from 'fs';
import { cursor } from 'uci';
import { list } from '../uci/config.uc';
import { fields as balanceFields } from '../uci/protocol/loadbalance.uc';
import { BaseOptions } from '../uci/protocol/options.uc';
import { atomic, mkdir, removeTree } from './system.uc';

// 安装迁移只调整已知旧字段：singbox/system 名称和旧分流负载均衡选项。
// 现有用户配置、凭据及自定义 Hook 不重置；执行多次仍得到同一份结果。
/** @param {uci.cursor} ctx 原生 UCI 游标。 */
export function migrate(ctx) {
	if (!ctx.load('hijpass')) die(`cannot load hijpass: ${ctx.error()}`);
	let shunt, dns, firewall, names = {}, ports = {};
	ctx.foreach('hijpass', null, s => {
		if (s.name) names[s.name] = true;
		for (let key in ['listen_port', 'socks_port', 'shunt_listen_port', 'dns_listen_port', 'cdg_port']) if (s[key]) ports[s[key]] = true;
		if (s['.type'] == 'shunt' && !shunt) shunt = s;
		if (s['.type'] == 'dns' && !dns) dns = s;
		if (s['.type'] == 'firewall' && !firewall) firewall = s;
		if (s.core == 'singbox') ctx.set('hijpass', s['.name'], 'core', 'sing-box');
	});
	// 旧服务端包可能不存在；仅存在时收集端口，避免迁移节点与它冲突。
	if (ctx.load('hijserver')) ctx.foreach('hijserver', null, s => {
		for (let key in ['listen_port', 'socks_port']) if (s[key]) ports[s[key]] = true;
	});
	if (shunt && (!shunt.type || shunt.type == 'singbox')) ctx.set('hijpass', shunt['.name'], 'type', 'sing-box');
	if (dns) for (let key in ['direct_dns', 'proxy_dns']) if (dns[key] == 'system') ctx.set('hijpass', dns['.name'], key, 'dnsmasq');
	if (firewall && !firewall.proxy_local) ctx.set('hijpass', firewall['.name'], 'proxy_local', '0');
	if (shunt && length(list(shunt.lb_node_list))) {
		let name = 'load-balance', suffix = 2;
		while (names[name]) name = `load-balance-${suffix++}`;
		function available(start) {
			while (ports[start] && start < 65535) start++;
			if (ports[start]) die('no available load balancing port');
			ports[start] = true;
			return `${start}`;
		}
		let listen = available(7890), socks = available(int(listen) + 1), id = ctx.add('hijpass', 'proxy_node');
		let options = {
			name, type: 'load_balance', core: shunt.type == 'xray' ? 'xray' : 'sing-box', enabled: '1',
			listen_port: listen, socks_port: socks, log_level: 'info', member_node: list(shunt.lb_node_list),
			log_path: `/tmp/hijpass/log/${name}-${id}.log`,
		};
		let keysToMove = filter(keys(balanceFields), key => !exists(BaseOptions, key));
		for (let key in keysToMove) if (shunt[key] != null) options[key] = shunt[key];
		for (let key, value in options) ctx.set('hijpass', id, key, value);
		ctx.foreach('hijpass', null, s => {
			for (let key in ['default_proxy_node', 'ruleset_out_node', 'proxy_node', 'proxy_node_v4', 'proxy_node_v6', 'dns_proxy_node'])
				if (s[key] == 'hijpass-slb') ctx.set('hijpass', s['.name'], key, name);
		});
		for (let key in ['lb_node_list', ...keysToMove]) ctx.delete('hijpass', shunt['.name'], key);
	}
	if (!ctx.commit('hijpass')) die(`cannot commit hijpass: ${ctx.error()}`);
};
export function install() {
	// 保留原有 UID 0 / 独立 GID 的账户模型，nft 根据 GID 排除代理核心上游连接。
	for (let path, entry in {
		'/etc/group': 'hijpass:x:4396:hijpass',
		'/etc/passwd': 'hijpass:x:0:4396:hijpass:/var/run/hijpass:/bin/false',
		'/etc/shadow': 'hijpass:x:0:0:99999:7:::',
	}) {
		let text = fs.readfile(path) || '';
		if (!match(text, /(^|\n)hijpass:/)) atomic(path, text + (text && substr(text, -1) != '\n' ? '\n' : '') + entry + '\n', path == '/etc/shadow' ? 0o600 : 0o644);
	}
	let ctx = cursor();
	if (!ctx) die('cannot create UCI cursor');
	migrate(ctx);
	if (!ctx.load('firewall')) die('cannot load firewall');
	ctx.delete('firewall', 'hijpass');
	ctx.set('firewall', 'hijpass', 'include');
	ctx.set('firewall', 'hijpass', 'type', 'script');
	ctx.set('firewall', 'hijpass', 'path', '/usr/lib/hijpass/fw4.sh');
	if (!ctx.commit('firewall')) die('cannot commit firewall include');
	for (let path in ['/etc/hijpass/client', '/etc/hijpass/server', '/tmp/hijpass/log', '/tmp/hijserver/log']) mkdir(path);
	for (let path in fs.glob('/tmp/luci-*cache') || []) removeTree(path);
};
