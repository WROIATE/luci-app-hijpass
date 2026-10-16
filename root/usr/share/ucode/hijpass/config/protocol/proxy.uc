import { fields as shadowsocks } from './shadowsocks.uc';
import { fields as vless } from './vless.uc';
import { fields as hysteria2 } from './hysteria2.uc';
import { fields as tuic } from './tuic.uc';
import { fields as shadowtls } from './shadowtls.uc';
import { fields as loadbalance } from './loadbalance.uc';
import { BaseOptions } from './options.uc';
import { decode, duration } from '../values.uc';

// 核心由 core 字段决定；未设置时统一使用 sing-box，不根据协议推断。
export const CORE = { singbox: 'sing-box', xray: 'xray', custom: 'custom' };
export function core(value) { return !value || value == 'singbox' ? CORE.singbox : value; };

export const TYPE = {
	shadowsocks: 'shadowsocks', vless: 'vless', hysteria2: 'hysteria2',
	tuic: 'tuic', shadowtls: 'shadowtls', balance: 'load_balance',
};
const protocols = {
	[TYPE.shadowsocks]: shadowsocks, [TYPE.vless]: vless, [TYPE.hysteria2]: hysteria2,
	[TYPE.tuic]: tuic, [TYPE.shadowtls]: shadowtls, [TYPE.balance]: loadbalance,
};
// 自定义核心不声明协议；只保留本地接入信息和用户命令，配置内容由用户维护。
const commandFields = {
	...BaseOptions,
	command: ['text', ''], // 原样交给 /bin/sh -c；可用 {conf_path} 引用用户配置文件
};

// Proxy 为对应协议 fields 的解码结果，只包含该协议声明的字段，额外包含：
// id/name/type/core（标识），upstream（上游 Proxy 或 null），members（成员 Proxy 数组）。
// upstream/members 在 dependencies.uc 中连接，生成器不再根据名字查询和重复解码。
export function proxy(section) {
	let engine = core(section.core);
	if (index(values(CORE), engine) < 0) die(`unsupported core "${engine}"`);
	let fields = engine == CORE.custom ? commandFields : protocols[section.type];
	if (!fields) die(`unsupported proxy type "${section.type}"`);
	let n = decode(section, fields);
	n.id = section['.name'];
	n.name = section.name || n.id;
	n.type = engine == CORE.custom ? '' : section.type;
	n.core = engine;
	n.upstream = null;
	n.members = [];
	if (engine == CORE.custom && !trim(n.command)) die(`custom node "${n.name}" has no command`);
	if (!n.listen_port || !n.socks_port) die('invalid listen_port or socks_port');
	if (engine != CORE.custom && n.type != TYPE.balance && (!n.server || !n.server_port))
		die('invalid server or server_port');
	if (n.type == TYPE.vless && engine == CORE.xray && n.transport_type == 'grpc'
		&& (duration(n.transport_grpc_idle_timeout) > 2147483647 || duration(n.transport_grpc_ping_timeout) > 2147483647))
		die('gRPC timeout exceeds 32-bit range');
	return n;
};
