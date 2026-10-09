import { BaseOptions, ServerOptions, TLSOptions } from './options.uc';

// tuic 的字段契约；不包含其它协议的专用字段。
export const fields = {
	...BaseOptions,
	...ServerOptions,
	...TLSOptions,
	password: ["text", ""], // 字符串，Password
	uuid: ["text", ""], // 字符串，UUID
	network: ["text", ""], // 字符串，Network
	congestion_control: ["text", "cubic"], // 字符串，CongestionControl
	udp_relay_mode: ["text", ""], // 字符串，UDPRelayMode
	udp_over_stream: ["bool", false], // UCI 0/1 开关，UDPOverStream
	zero_rtt_handshake: ["bool", false], // UCI 0/1 开关，ZeroRTT
	heartbeat: ["duration", 10], // 时长字符串，解码后单位为秒，Heartbeat
};
