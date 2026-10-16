import { cursor } from 'uci';
import { list } from 'hijpass.config.values';
import { fields as balanceFields } from 'hijpass.config.protocol.loadbalance';
import { BaseOptions } from 'hijpass.config.protocol.options';
import { run } from 'hijpass.common';

// 安装迁移只调整已知旧字段：singbox/system 名称和旧分流负载均衡选项。
// 现有用户配置、凭据及自定义 Hook 不重置；执行多次仍得到同一份结果。
/**
 * @param {uci.cursor} ctx 原生 UCI 游标。
 */
export function migrate(ctx) {
	if (!ctx.load('hijpass')) die(`cannot load hijpass: ${ctx.error()}`);
	let shunt, dns, firewall, names = {}, ports = {};
	ctx.foreach('hijpass', null, s => {
        if (s['.type'] == 'hijpass') {
            // 兼容旧整表路径；迁移不删除旧链规则文件。
            if (!s.firewall_template) {
                let path = s.nft;
                if (!path || index(['/etc/hijpass/fw4-template.nft', '/etc/hijpass/fw4-template.ut'], path) >= 0)
                    path = '/etc/hijpass/firewall.ut';
                ctx.set('hijpass', s['.name'], 'firewall_template', path);
            }
            ctx.delete('hijpass', s['.name'], 'nft');
            ctx.delete('hijpass', s['.name'], 'firewall_rules');
        }
        if (s['.type'] == 'firewall') for (let key in [
            'pre_filter_hash', 'out_route_hash', 'tproxy_shunt_hash', 'tproxy_mark_hash',
            'proxy_port_filter_hash', 'dns_forward_hash', 'dns_forward_output_hash',
        ]) ctx.delete('hijpass', s['.name'], key);
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

export function main() { run(() => {
    let ctx = cursor();
    if (!ctx) die('cannot create UCI cursor');
    migrate(ctx);
    if (!ctx.load('firewall')) die('cannot load firewall');
    ctx.delete('firewall', 'hijpass');
    ctx.set('firewall', 'hijpass', 'include');
    ctx.set('firewall', 'hijpass', 'type', 'script');
    ctx.set('firewall', 'hijpass', 'path', '/usr/lib/hijpass/firewall/fw4.sh');
    if (!ctx.commit('firewall')) die('cannot commit firewall include');
});
};
