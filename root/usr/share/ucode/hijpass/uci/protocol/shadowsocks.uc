import { BaseOptions, ServerOptions, MultiplexOptions } from './options.uc';

// shadowsocks 的字段契约；不包含其它协议的专用字段。
export const fields = {
	...BaseOptions,
	...ServerOptions,
	...MultiplexOptions,
	password: ["text", ""], // 字符串，Password
	network: ["text", ""], // 字符串，Network
	method: ["text", ""], // 字符串，Method
	plugin: ["text", ""], // 字符串，Plugin
	plugin_opts: ["text", ""], // 字符串，PluginOptions
	udp_over_tcp: ["bool", false], // UCI 0/1 开关，UDPOverTCP
};
