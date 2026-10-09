import { BaseOptions, ServerOptions, TLSOptions } from './options.uc';

// hysteria2 的字段契约；不包含其它协议的专用字段。
export const fields = {
	...BaseOptions,
	...ServerOptions,
	...TLSOptions,
	password: ["text", ""], // 字符串，Password
	network: ["text", ""], // 字符串，Network
	up_mbps: ["integer", null, 2147483647], // 非负整数，单位 Mbps；null 表示未设置，0 表示明确关闭限制，UpMbps
	down_mbps: ["integer", null, 2147483647], // 非负整数，单位 Mbps；null 表示未设置，0 表示明确关闭限制，DownMbps
	udp_idle_timeout: ["integer", 0], // 非负整数，UDPIdleTimeout
	server_ports: ["list", []], // 字符串列表，ServerPorts
	hop_interval: ["duration", 0], // 时长字符串，解码后单位为秒，HopInterval
	obfs_type: ["text", ""], // 字符串，ObfsType
	obfs_password: ["text", ""], // 字符串，ObfsPassword
};
