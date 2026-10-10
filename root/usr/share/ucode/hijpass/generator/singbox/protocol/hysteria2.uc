import { endpoint, tls } from './options.uc';
import { optional } from '../../constants.uc';

// up_mbps/down_mbps 为带宽；server_ports 为端口跳跃范围，核心使用冒号分隔。
// hop_interval 为跳跃间隔；obfs 仅支持有密码的 salamander。
export function build(n) {
	let out = endpoint(n);
	out.tls = tls(n);
	optional(out, 'password', n.password);
	optional(out, 'up_mbps', n.up_mbps);
	optional(out, 'down_mbps', n.down_mbps);
	optional(out, 'server_ports', map(n.server_ports, p => replace(p, '-', ':')));
	optional(out, 'hop_interval', n.hop_interval);
	if (n.obfs_type == 'salamander' && n.obfs_password)
		out.obfs = { type: n.obfs_type, password: n.obfs_password };
	return out;
};
