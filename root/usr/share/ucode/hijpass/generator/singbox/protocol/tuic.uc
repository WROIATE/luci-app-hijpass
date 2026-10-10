import { endpoint, tls } from './options.uc';
import { optional } from '../../constants.uc';
import { durationText } from '../../../uci/config.uc';

// UUID/password 为认证；congestion_control 为拥塞算法，udp_relay_mode 为 UDP 模式。
// udp_over_stream/zero_rtt_handshake 为开关，heartbeat 为 QUIC 心跳间隔。
export function build(n) {
	let out = endpoint(n);
	out.tls = tls(n);
	for (let key in ['uuid', 'password', 'congestion_control', 'udp_relay_mode', 'udp_over_stream', 'zero_rtt_handshake'])
		optional(out, key, n[key]);
	optional(out, 'heartbeat', n.heartbeat ? durationText(n.heartbeat) : null);
	return out;
};
