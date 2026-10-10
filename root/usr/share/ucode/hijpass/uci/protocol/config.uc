import { fields as shadowsocks } from './shadowsocks.uc';
import { fields as vless } from './vless.uc';
import { fields as hysteria2 } from './hysteria2.uc';
import { fields as tuic } from './tuic.uc';
import { fields as shadowtls } from './shadowtls.uc';
import { fields as loadbalance } from './loadbalance.uc';
import { fields as custom } from './custom.uc';
import { decode, duration } from '../config.uc';
import { CORE, core } from '../../generator/constants.uc';

export const TYPE = {
	shadowsocks: 'shadowsocks', vless: 'vless', hysteria2: 'hysteria2',
	tuic: 'tuic', shadowtls: 'shadowtls', balance: 'load_balance', custom: 'custom',
};
const protocols = {
	[TYPE.shadowsocks]: shadowsocks, [TYPE.vless]: vless, [TYPE.hysteria2]: hysteria2,
	[TYPE.tuic]: tuic, [TYPE.shadowtls]: shadowtls, [TYPE.balance]: loadbalance, [TYPE.custom]: custom,
};

// Proxy 为所属协议 fields 的解码结果，额外包含：
// id/name/type/core（标识），upstream（上游 Proxy 或 null），members（成员 Proxy 数组）。
// upstream/members 在 graph.uc 中连接，生成器不再根据名字查询和重复解码。
export function proxy(section) {
	let engine = core(section.core ?? (section.type == TYPE.vless ? CORE.xray : CORE.singbox));
	if (index(values(CORE), engine) < 0) die(`unsupported core "${engine}"`);
	let fields = engine == CORE.custom ? custom : protocols[section.type];
	if (!fields) die(`unsupported proxy type "${section.type}"`);
	let n = decode(section, fields);
	n.id = section['.name'];
	n.name = section.name || n.id;
	n.type = engine == CORE.custom ? TYPE.custom : section.type;
	n.core = engine;
	n.upstream = null;
	n.members = [];
	if (!n.listen_port || !n.socks_port) die('invalid listen_port or socks_port');
	if (n.type != TYPE.balance && n.type != TYPE.custom && (!n.server || !n.server_port))
		die('invalid server or server_port');
	if (n.type == TYPE.vless && engine == CORE.xray && n.transport_type == 'grpc'
		&& (duration(n.transport_grpc_idle_timeout) > 2147483647 || duration(n.transport_grpc_ping_timeout) > 2147483647))
		die('gRPC timeout exceeds 32-bit range');
	return n;
};
