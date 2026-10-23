import { endpoint, tls } from './options.uc';
import { optional } from '../../json.uc';

// UUID/password 为认证；congestion_control 为拥塞算法，udp_relay_mode 为 UDP 模式。
// udp_over_stream/zero_rtt_handshake 为开关，heartbeat 为 QUIC 心跳间隔。
/** @returns {object} sing-box TUIC 出站，含 TLS、UUID/密码、拥塞控制及 UDP/握手/心跳选项。 */
export function build(n) {
	let out = endpoint(n);
	out.tls = tls(n);
	for (let key in ['uuid', 'password', 'congestion_control', 'udp_relay_mode'])
		optional(out, key, n[key]);
	for (let key in ['udp_over_stream', 'zero_rtt_handshake'])
		if (n[key]) out[key] = true;
	optional(out, 'heartbeat', n.heartbeat);
	return out;
};
