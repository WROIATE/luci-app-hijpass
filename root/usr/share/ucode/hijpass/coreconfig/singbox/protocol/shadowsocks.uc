import { endpoint, multiplex } from './options.uc';
import { optional } from '../../constants.uc';

// method/password 为加密方法与凭据；plugin/plugin_opts 为可选插件；
// udp_over_tcp 与 multiplex 为 sing-box 原生对象，仅启用时创建。
export function build(n) {
	let out = endpoint(n);
	optional(out, 'method', n.method);
	optional(out, 'password', n.password);
	optional(out, 'plugin', n.plugin);
	optional(out, 'plugin_opts', n.plugin_opts);
	optional(out, 'multiplex', multiplex(n));
	if (n.udp_over_tcp) out.udp_over_tcp = true;
	return out;
};
