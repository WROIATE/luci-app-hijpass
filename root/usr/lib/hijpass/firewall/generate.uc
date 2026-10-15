import * as fs from 'fs';
import { sections as read } from 'hijpass.common';
import { first } from 'hijpass.config.sections';
import { list, port } from 'hijpass.config.values';
import { lines, run, sections, text, renderTemplate } from 'hijpass.common';

// Firewall 的输入仍使用 UCI 字段：proxy_port/shunt_port 为透明代理入口，
// tproxy_proto 为 tcp/udp 列表，dns_forward 为 none/pre-routing/routing；
// proxy_local 控制路由器本机，acl_default_allow 与 MAC/接口列表控制客户端。
// NetworkState：wan 为 WAN 设备名；local4/local6/dns4/dns6 为本地绕过地址数组。
/**
 * @typedef {object} CommandOutput
 * @property {string} stdout 外部命令输出的原始 JSON 文本。
 * @property {integer} code 命令的退出状态，0 表示成功。
 */
/**
 * @typedef {object} NetworkSnapshot
 * @property {string} wan fw4 返回的 WAN 设备名，每行一个。
 * @property {CommandOutput} addresses ip -j address 的输出与退出状态。
 * @property {CommandOutput} interfaces ubus network.interface dump 的输出与退出状态。
 */
/**
 * @param {NetworkSnapshot} raw Shell 采集的网络快照。
 */
function networkState(raw) {
	let state = { wan: lines(raw.wan), local4: [], local6: [], dns4: [], dns6: [] };
	let addresses = raw.addresses, interfaces = raw.interfaces;
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

// FirewallOptions：端口为已校验整数，0 表示未启用；protocols 为 tcp/udp 数组。
// wan/interfaces/excludedInterfaces 是设备名数组，macs/excludedMacs 是 MAC 数组。
// proxyLocal/allowAll/useChnRoute/useChn/useGfw/domainSets 控制对应规则和集合。
// ip4/ip6 各含 direct/proxy/china 地址数组；空静态列表不生成集合或匹配规则。
// proxyMark/shuntMark/user 是内部固定参数；*Names 是已引用、转义的 nft 接口列表。
/**
 * @param {object[]} config
 * @param {{wan: string[], local4: string[], local6: string[], dns4: string[], dns6: string[]}} state
 */
function options(config, state) {
    let f = first(config, 'firewall'), global = first(config, 'hijpass');
    let dns = first(config, 'dns'), shunt = first(config, 'shunt');
    let forward = '';
    if (f.dns_forward == 'pre-routing' && dns.dns_service == 'chinadns-ng') forward = dns.cdg_port;
    if (f.dns_forward == 'routing' && shunt.enabled != '0') forward = shunt.dns_listen_port;
    // option 'tcp,udp' 与 list 两种写法均转换为协议数组。
    let protocols = filter(split(join(',', list(f.tproxy_proto)), /[, \t]+/), value => value != '');
    if (!length(protocols)) die('tproxy_proto is required');
    for (let value in protocols) if (index(['tcp', 'udp'], value) < 0) die('invalid tproxy_proto');
    function macs(values) {
        for (let value in values) if (!match(value, /^[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){5}$/)) die('invalid proxy MAC');
        return values;
    }
    function interfaces(values) {
        for (let value in values) if (!match(value, /^[A-Za-z0-9_.:@-]+$/)) die('invalid proxy interface');
        return values;
    }
    /** @param {string[]} names @returns {string} */
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
    for (let version in [4, 6]) result[`ip${version}`] = {
        direct: uniq([...state[`dns${version}`], ...state[`local${version}`], ...ipList(global.ip_direct, version)]),
        proxy: uniq(ipList(global.ip_proxy, version)),
        china: result.useChnRoute ? uniq(ipList(version == 4 ? global.chn_route : global.chn_route6, version)) : [],
    };
    return result;
}
/**
 * @param {object[]} config
 * @param {{wan: string[], local4: string[], local6: string[], dns4: string[], dns6: string[]}} state
 * @param {string} ruleDirectory 只包含各链内部规则模板的目录。
 */
export function generate(config, state, ruleDirectory) {
    let f = first(config, 'firewall');
    if (!f.proxy_port && !f.shunt_port) return '';
    // 旧整表模板不能当成链内规则使用；未迁移的自定义路径必须明确报告。
    let legacy = first(config, 'hijpass').nft;
    if (legacy && index(['/etc/hijpass/fw4-template.nft', '/etc/hijpass/fw4-template.ut'], legacy) < 0)
        die('legacy nft template: move chain rules to firewall_rules before enabling the firewall');
    if (type(ruleDirectory) != 'string' || !length(ruleDirectory)) die('firewall_rules directory is required');
    let values = options(config, state);
    // ChainDefinition：name 对应同名 .ut；hook 是完整基础链声明，普通链为空。
    // requires 列出 FirewallOptions 字段，全部为真才启用；空数组表示始终启用。
    // LuCI 从同一个只读文件获取链列表和 hook，避免页面与生成结果各自维护。
    let definitions;
    try {
        let source = fs.readfile('/usr/lib/hijpass/firewall/chains.json');
        if (type(source) != 'string') die('file is unreadable');
        definitions = json(source);
    }
    catch (e) { die(`firewall chain definitions: ${e.message}`); }
    if (type(definitions) != 'array' || !length(definitions)) die('firewall chain definitions must be a non-empty array');
    let chains = [], names = {};
    for (let chain in definitions) {
        if (type(chain) != 'object' || type(chain.name) != 'string' || !match(chain.name, /^[A-Za-z][A-Za-z0-9_-]*$/) ||
            type(chain.hook) != 'string' || type(chain.requires) != 'array') die('invalid firewall chain definition');
        if (names[chain.name]) die(`duplicate firewall chain "${chain.name}"`);
        names[chain.name] = true;
        let enabled = true;
        for (let field in chain.requires) {
            if (type(field) != 'string' || !exists(values, field)) die(`unknown firewall condition "${field}"`);
            if (!values[field]) enabled = false;
        }
        // 未启用链不读取规则文件；即使条件不满足，也检查该链的全部条件名。
        if (!enabled) continue;
        let path = `${ruleDirectory}/${chain.name}.ut`;
        // 空文件允许清空链内规则；缺失文件则必须失败，避免意外生成残缺规则。
        if (fs.readfile(path) == null) die(`firewall rule template is unreadable: ${path}`);
        push(chains, { name: chain.name, hook: chain.hook, rules: renderTemplate(path, { options: values }) });
    }
    let sets = renderTemplate('/usr/lib/hijpass/firewall/sets.ut', { options: values });
    return renderTemplate('/usr/lib/hijpass/firewall/ruleset.ut', { chains, sets });
};

// NetworkSnapshot：Shell 采集的 wan 文本以及 address/interface 命令的输出与退出码。
export function main() { run(() => {
    let config = sections(), directory = ARGV[0];
    let raw = { wan: text(directory + '/wan'),
        addresses: { stdout: text(directory + '/addresses'), code: int(text(directory + '/addresses.code')) },
        interfaces: { stdout: text(directory + '/interfaces'), code: int(text(directory + '/interfaces.code')) } };
    return generate(config, networkState(raw), first(config, 'hijpass').firewall_rules || '/etc/hijpass/firewall');
});
};
