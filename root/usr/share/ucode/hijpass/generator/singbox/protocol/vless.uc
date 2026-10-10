import { endpoint, tls, transport, multiplex } from './options.uc';
import { optional } from '../../constants.uc';

// uuid 标识用户；flow/packet_encoding 为 VLESS 扩展，transport 为传输层。
// Reality 必须有公钥，并同时启用 uTLS，使用 chrome 指纹。
export function build(n) {
	let out = endpoint(n);
	optional(out, 'uuid', n.uuid);
	optional(out, 'flow', n.flow);
	if (n.packet_encoding) out.packet_encoding = n.packet_encoding;
	out.tls = tls(n);
	if (n.tls_reality_enabled) {
		if (!n.tls_reality_public_key) die('reality public key is required');
		out.tls.reality = { enabled: true, public_key: n.tls_reality_public_key };
		optional(out.tls.reality, 'short_id', n.tls_reality_short_id);
		out.tls.utls = { enabled: true, fingerprint: 'chrome' };
	}
	optional(out, 'transport', transport(n));
	optional(out, 'multiplex', multiplex(n));
	return out;
};
