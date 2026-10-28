import * as fs from 'fs';
import { RULE_FILES, FILES } from 'hijpass.config.paths';
import { read } from 'hijpass.uci.read';
import { first } from 'hijpass.config.sections';
import { list, port } from 'hijpass.config.values';
import { lines, text, renderTemplate } from 'hijpass.common';
import { run } from 'hijpass.command.runtime';
import { parseCIDR } from 'hijpass.ip';

// Firewall 的输入仍使用 UCI 字段：proxy_port/shunt_port 为透明代理入口，
// tproxy_proto 为 tcp/udp 列表，dns_forward 为 none/pre-routing/routing；
// proxy_local 控制路由器本机，acl_default_allow 与 MAC/接口列表控制客户端。
// NetworkState：wan 为 WAN 设备名；local4/local6/dns4/dns6 为本地绕过地址数组。
/** @typedef {import('../../../share/ucode/hijpass/types/network.uc').CommandOutput} CommandOutput */
/** @typedef {import('../../../share/ucode/hijpass/types/network.uc').NetworkSnapshot} NetworkSnapshot */
/**
 * 把 Shell 采集的网络快照整理成防火墙所需的数据。
 * @param {NetworkSnapshot} raw Shell 采集的网络快照。
 * @param {string|null} resolvText dnsmasq resolvfile 的内容。
 * @returns {object} {wan, local4, local6, dns4, dns6}，分别为绕过设备、本机网段和上游 DNS。
 */
function networkState(raw, resolvText) {
	let state = { wan: lines(raw.wan), local4: [], local6: [], dns4: [], dns6: [] };
	let addresses = raw.addresses, interfaces = raw.interfaces;
	// 命令的 JSON 解析失败时报告来源；不能用残缺网络状态继续生成绕过规则。
	try {
		if (!addresses.code) {
			for (let iface in json(addresses.stdout)) {
				for (let addr in iface.addr_info || []) push(addr.family == 'inet6' ? state.local6 : state.local4, `${addr.local}/${addr.prefixlen}`);
			}
		}
		if (!interfaces.code) {
			for (let iface in json(interfaces.stdout).interface || []) {
				if (!length(filter(iface.route || [], route => route.mask == 0))) {
					continue;
				}
				for (let name in [iface.device, iface.l3_device]) {
					if (name && name != 'br-lan') {
						push(state.wan, name);
					}
				}
			}
		}
	}
	catch (e) { die(`invalid network state JSON: ${e.message}`); }
	for (let line in lines(resolvText)) {
		let fields = split(line, /[ \t]+/), address = split(fields[1] || '', '%')[0] || '', bytes = iptoarr(address);
		if (fields[0] != 'nameserver' || !bytes || index(['0.0.0.0', '127.0.0.1', '::', '::1'], address) >= 0) {
			continue;
		}
		push(length(bytes) == 4 ? state.dns4 : state.dns6, address);
	}
	state.wan = uniq(state.wan);
	return state;
};
/**
 * 读取规则文件，只保留指定地址族的有效 IP 和 CIDR。
 * @param {string} path
 * @param {integer} version
 * @returns {string[]} 地址数组；文件缺失或为空时返回空数组。
 */
function ipList(path, version) {
	return filter(lines(fs.readfile(path)), value => parseCIDR(value)?.family == version);
}

// 默认副本由打包流程从可编辑模板生成，升级时更新且不受用户编辑影响。
/**
 * 读取软件包提供的默认防火墙模板。
 * @returns {string} 默认模板原文；读取失败时抛错。
 */
export function defaultTemplate() { return text('/usr/lib/hijpass/firewall/default.ut'); };

// FirewallOptions：端口为已校验整数，0 表示未启用；protocols 为 tcp/udp 数组。
// wan/interfaces/excludedInterfaces 是设备名数组，macs/excludedMacs 是 MAC 数组。
// proxyLocal/allowAll/useChnRoute/useChn/useGfw/domainSets 控制对应规则和集合。
// ip4/ip6 各含 direct/proxy/china 地址数组；空静态列表不生成集合或匹配规则。
// proxyMark/shuntMark/user 是内部固定参数；*Names 是已引用、转义的 nft 接口列表。
/**
 * 合并 UCI 设置和网络状态，整理防火墙模板参数。
 * @param {object[]} config
 * @param {{wan: string[], local4: string[], local6: string[], dns4: string[], dns6: string[]}} state
 * @returns {object} 供 firewall.ut 使用的 options 对象。
 */
function options(config, state) {
    let f = first(config, 'firewall');
    let dns = first(config, 'dns'), shunt = first(config, 'shunt');
    let forward = '';
    if (f.dns_forward == 'pre-routing' && dns.dns_service == 'chinadns-ng') {
        forward = dns.cdg_port;
    }
    if (f.dns_forward == 'routing' && shunt.enabled != '0') {
        forward = shunt.dns_listen_port;
    }
    // option 'tcp,udp' 与 list 两种写法均转换为协议数组。
    let protocols = filter(split(join(',', list(f.tproxy_proto)), /[, \t]+/), value => value != '');
    if (!length(protocols)) {
        die('tproxy_proto is required');
    }
    for (let value in protocols) {
        if (index(['tcp', 'udp'], value) < 0) {
            die('invalid tproxy_proto');
        }
    }
    /**
     * 校验访问控制中的 MAC 地址，发现非法值时报错。
     * @returns {string[]} 原 MAC 地址数组。
     */
    function macs(values) {
        for (let value in values) {
            if (!match(value, /^[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){5}$/)) {
                die('invalid proxy MAC');
            }
        }
        return values;
    }
    /**
     * 校验接口名称，拒绝无法安全写入规则的字符。
     * @returns {string[]} 原接口名称数组。
     */
    function interfaces(values) {
        for (let value in values) {
            if (!match(value, /^[A-Za-z0-9_.:@-]+$/)) {
                die('invalid proxy interface');
            }
        }
        return values;
    }
    /**
     * 将接口名称转义为可嵌入 nft 集合的字符串。
     * @param {string[]} names
     * @returns {string} 带引号、以逗号分隔的接口名称。
     */
    function quoteNames(names) {
        return join(', ', map(names, name => sprintf('%J', name)));
    }
    let result = {
        proxyPort: f.proxy_port ? port(f.proxy_port) : 0,
        shuntPort: f.shunt_port ? port(f.shunt_port) : 0,
        forwardPort: forward ? port(forward) : 0,
        protocols, wan: state.wan,
        proxyMark: 0x1, shuntMark: 0x3, user: 'hijpass',
        proxyLocal: f.proxy_local == '1', allowAll: f.acl_default_allow == '1',
        useChnRoute: f.use_chnroute == '1', useChn: dns.use_chn == '1', useGfw: dns.use_gfw == '1',
        domainSets: dns.dns_service != 'custom',
        macs: macs(list(f.proxy_mac_list)), excludedMacs: macs(list(f.proxy_mac_exclude_list)),
        interfaces: interfaces(list(f.proxy_iface_list)), excludedInterfaces: interfaces(list(f.proxy_iface_exclude_list)),
    };
    result.wanNames = quoteNames(result.wan);
    result.interfaceNames = quoteNames(result.interfaces);
    result.excludedInterfaceNames = quoteNames(result.excludedInterfaces);
    for (let version in [4, 6]) {
        let lists = {
            direct: uniq([...state[`dns${version}`], ...state[`local${version}`], ...ipList(RULE_FILES.ip_direct, version)]),
            proxy: uniq(ipList(RULE_FILES.ip_proxy, version)),
            china: [],
        };
        if (result.useChnRoute) {
            let routeFile = version == 4 ? RULE_FILES.chn_route : RULE_FILES.chn_route6;
            lists.china = uniq(ipList(routeFile, version));
        }
        result[`ip${version}`] = lists;
    }
    return result;
}
/**
 * 检查代理入口，并使用当前模板生成防火墙规则。
 * @param {object[]} config
 * @param {{wan: string[], local4: string[], local6: string[], dns4: string[], dns6: string[]}} state
 * @returns {string} 完整 nft 表文本；没有代理或分流入口时为空字符串。
 */
export function generate(config, state) {
    let f = first(config, 'firewall');
    if (!f.proxy_port && !f.shunt_port) {
        return '';
    }
    let path = FILES.firewall_template;
    if (type(path) != 'string') {
        die('invalid firewall template path');
    }
    let output = renderTemplate(path, { options: options(config, state) });
    // 空模板不能让已启用的防火墙被当作关闭处理。
    if (!length(trim(output))) {
        die('firewall template rendered no rules');
    }
    return output;
};

// NetworkSnapshot：Shell 采集的 wan 文本以及 address/interface 命令的输出与退出码。
/**
 * 处理防火墙脚本的 Hook 路径查询或规则生成请求。
 * @returns {null} Hook 路径或生成的 nft 文本写入 stdout。
 */
export function main() { run(ARGV, (args, configDirectory) => {
    if (args[0] == 'hook') {
        return FILES.nft_hook + '\n';
    }
    let config = read('hijpass', configDirectory), directory = args[0];
    let raw = { wan: text(directory + '/wan'),
        addresses: { stdout: text(directory + '/addresses'), code: int(text(directory + '/addresses.code')) },
        interfaces: { stdout: text(directory + '/interfaces'), code: int(text(directory + '/interfaces.code')) } };
    let dhcp = first(read('dhcp', configDirectory), 'dnsmasq');
    return generate(config, networkState(raw, fs.readfile(dhcp.resolvfile)));
});
};
