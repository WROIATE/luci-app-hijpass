import { BaseOptions, ServerOptions, TLSOptions } from './options.uc';

// shadowtls 的字段契约；不包含其它协议的专用字段。
export const fields = {
	...BaseOptions,
	...ServerOptions,
	...TLSOptions,
	password: ["text", ""], // 字符串，Password
	version: ["integer", 1, 2147483647], // 非负整数，ShadowTLSVersion
};
