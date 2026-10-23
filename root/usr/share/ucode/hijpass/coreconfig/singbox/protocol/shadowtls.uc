import { endpoint, tls } from './options.uc';
import { optional } from '../../json.uc';

// version/password 为 ShadowTLS 握手版本与凭据；TLS 服务器名独立于连接地址。
/**
 * 将 ShadowTLS 节点转换为 sing-box 原生出站配置。
 * @returns {object} 含 TLS、版本和认证密码的出站对象。
 */
export function build(n) {
	let out = endpoint(n);
	out.tls = tls(n);
	optional(out, 'version', n.version);
	optional(out, 'password', n.password);
	return out;
};
