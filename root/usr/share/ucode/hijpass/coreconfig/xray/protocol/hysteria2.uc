// Hysteria2 在 Xray 中使用 hysteria 协议及 version=2；认证位于传输设置。
// 带宽放在 finalmask.quicParams；未设置与明确为 0 必须区分。
/** @returns {object} Xray Hysteria2 出站，protocol 为 hysteria，版本为 2，认证和带宽选项位于 streamSettings。 */
export function build(n) {
	let stream = {
		network: 'hysteria', security: 'tls',
		tlsSettings: { serverName: n.tls_server_name || n.server, alpn: ['h3'] },
		hysteriaSettings: { version: 2, auth: n.password, udpIdleTimeout: n.udp_idle_timeout },
	};
	if (n.up_mbps != null || n.down_mbps != null) {
		/** @returns {string} Xray 带宽文本：未设置为空字符串，显式零值为 "0"，其余为 "数值 mbps"。 */
		function bandwidth(value) { return value == null ? '' : value ? `${value} mbps` : '0'; }
		stream.finalmask = { quicParams: { brutalUp: bandwidth(n.up_mbps), brutalDown: bandwidth(n.down_mbps) } };
	}
	return {
		protocol: 'hysteria', tag: n.name,
		settings: { version: 2, address: n.server, port: n.server_port },
		streamSettings: stream,
	};
};
