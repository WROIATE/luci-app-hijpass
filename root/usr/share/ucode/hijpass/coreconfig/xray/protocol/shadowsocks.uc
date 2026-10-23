// settings 使用最新 Xray 的扁平地址结构；不再生成旧 servers 数组。
// 最新核心已移除 udp_over_tcp，明确报错以避免生成无效配置。
/** @returns {object} Xray Shadowsocks 出站，使用扁平 settings.address/port/method/password 结构。 */
export function build(n) {
	if (n.udp_over_tcp) die('Xray main no longer supports Shadowsocks udp_over_tcp; disable it or select sing-box');
	return {
		protocol: n.type, tag: n.name,
		settings: { address: n.server, port: n.server_port, method: n.method, password: n.password },
	};
};
