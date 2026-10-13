import { apply } from './transport.uc';

// settings.id 为用户 UUID；encryption 固定 none；streamSettings 保存传输和 TLS。
// Reality 使用最新 Xray 的 password 公钥字段，TLS ALPN 保留 h2/http1.1。
export function build(n) {
	let stream = { network: 'raw', security: 'none' };
	if (n.tls_reality_enabled) {
		stream.security = 'reality';
		stream.realitySettings = {
			fingerprint: 'chrome', serverName: n.tls_server_name || n.server,
			password: n.tls_reality_public_key, shortId: n.tls_reality_short_id,
		};
	}
	else if (n.tls_server_name) {
		stream.security = 'tls';
		stream.tlsSettings = { serverName: n.tls_server_name, alpn: ['h2', 'http/1.1'] };
	}
	apply(stream, n);
	return {
		protocol: n.type, tag: n.name,
		settings: { address: n.server, port: n.server_port, id: n.uuid, encryption: 'none', flow: n.flow },
		streamSettings: stream,
	};
};
