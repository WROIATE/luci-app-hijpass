import { BaseOptions, ServerOptions, TLSOptions, RealityOptions, MultiplexOptions, TransportOptions } from './options.uc';

// vless 的字段契约；不包含其它协议的专用字段。
export const fields = {
	...BaseOptions,
	...ServerOptions,
	...TLSOptions,
	...RealityOptions,
	...MultiplexOptions,
	...TransportOptions,
	uuid: ["text", ""], // 字符串，UUID
	network: ["text", "tcp"], // 字符串，Network
	flow: ["text", ""], // 字符串，Flow
	packet_encoding: ["text", ""], // 字符串，PacketEncoding
};
