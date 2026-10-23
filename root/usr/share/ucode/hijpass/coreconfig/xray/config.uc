import { build as shadowsocks } from './protocol/shadowsocks.uc';
import { build as vless } from './protocol/vless.uc';
import { build as hysteria2 } from './protocol/hysteria2.uc';
import { TYPE } from '../../config/protocol/proxy.uc';
import { TAG } from '../constants.uc';

const builders = { [TYPE.shadowsocks]: shadowsocks, [TYPE.vless]: vless, [TYPE.hysteria2]: hysteria2 };
/** @returns {object} 连接本机指定端口的 Xray SOCKS 出站，含 protocol/tag 及 settings.address/port。 */
export function socks(tag, port) {
	return { protocol: 'socks', tag, settings: { address: '127.0.0.1', port } };
};
/** @returns {object} Xray 日志配置 {loglevel, dnsLog}；warn 转为 warning，缺省 info，并关闭 dnsLog。 */
export function log(level) { return { loglevel: level == 'warn' ? 'warning' : level || 'info', dnsLog: false }; };
/** @returns {object} Xray 入站对象；SOCKS 启用 UDP，tproxy 配置透明代理，并按 shunt 标志启用嗅探。 */
export function inbound(kind, tag, port, shunt) {
	let out = { protocol: kind == 'socks' ? 'socks' : 'dokodemo-door', port, tag };
	if (kind == 'socks') out.settings = { udp: true };
	else {
		out.settings = { network: 'tcp,udp' };
		if (kind == 'tproxy') {
			out.settings.followRedirect = true;
			out.streamSettings = { sockopt: { tproxy: 'tproxy' } };
			if (shunt) out.sniffing = { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: true };
		}
		else out.listen = '::';
	}
	return out;
};

// Config 字段：log/inbounds/outbounds 为核心基础配置；routing 为路由表。
// burstObservatory.pingConfig 为负载均衡探测参数，时长使用核心字符串格式。
/** @returns {object} 单个代理节点的完整 Xray 配置，含日志、入站及出站；均衡节点另含路由策略和 burstObservatory。 */
export function build(n) {
	let config = {
		log: log(n.log_level),
		inbounds: [inbound('tproxy', TAG.tproxy, n.listen_port), inbound('socks', TAG.socks, n.socks_port)],
		outbounds: [],
	};
	if (n.type == TYPE.balance) {
		let fallback = TAG.member + '0';
		for (let i, member in n.members) {
			let tag = `${TAG.member}${i}`;
			if (member.name == n.fallback_tag) fallback = tag;
			push(config.outbounds, socks(tag, member.socks_port));
		}
		let strategy = { type: n.strategy || 'leastLoad' };
		if (strategy.type == 'leastLoad') strategy.settings = {
			expected: n.strategy_expected ?? 1, maxRTT: n.strategy_max_rtt || '1s', tolerance: n.strategy_tolerance ?? 0.05,
		};
		config.routing = {
			domainStrategy: 'AsIs',
			rules: [{ inboundTag: [TAG.tproxy, TAG.socks], balancerTag: TAG.balance }],
			balancers: [{ tag: TAG.balance, selector: [TAG.member], fallbackTag: fallback, strategy }],
		};
		config.burstObservatory = {
			subjectSelector: [TAG.member],
			pingConfig: {
				destination: n.probe_url || 'https://connectivitycheck.gstatic.com/generate_204', connectivity: n.probe_connectivity,
				interval: n.probe_interval || '60s', timeout: n.probe_timeout || '2s',
				sampling: n.probe_sampling || 3, httpMethod: n.probe_http_method,
			},
		};
	}
	else {
		let builder = builders[n.type];
		if (!builder) die(`unsupported Xray protocol "${n.type}"`);
		let out = builder(n);
		push(config.outbounds, out);
		if (n.upstream) {
			let tag = TAG.upstream + n.upstream.name;
			out.streamSettings ||= {};
			out.streamSettings.sockopt = { dialerProxy: tag, domainStrategy: 'UseIP' };
			push(config.outbounds, socks(tag, n.upstream.socks_port));
		}
	}
	return config;
};
