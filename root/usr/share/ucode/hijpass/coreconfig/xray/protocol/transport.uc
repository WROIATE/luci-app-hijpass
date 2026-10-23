import { duration } from '../../../config/values.uc';

// streamSettings.network 为 Xray 原生传输名；只接收当前核心支持的传输。
// WS 的 early data 通过 URL 的 ed 参数传递，必须保留已有 query 和 fragment。
/**
 * @typedef {object} TransportOptions
 * @property {string} transport_type 传输类型；空值使用协议默认传输。
 * @property {string} transport_xhttp_host XHTTP Host 头。
 * @property {string} transport_xhttp_path XHTTP 路径。
 * @property {string} transport_xhttp_mode XHTTP 模式。
 * @property {string} transport_xhttp_method XHTTP 上行请求方法；空值由核心决定。
 * @property {string} transport_httpupgrade_host HTTPUpgrade Host 头。
 * @property {string} transport_httpupgrade_path HTTPUpgrade 路径。
 * @property {string} transport_ws_host WebSocket Host 头。
 * @property {string} transport_ws_path WebSocket 路径，空值使用 /。
 * @property {integer|null} transport_ws_max_early_data early data 字节数；null 表示未设置。
 * @property {string} transport_grpc_service_name gRPC 服务名称。
 * @property {string} transport_grpc_idle_timeout 空闲时长，生成时转换为秒。
 * @property {string} transport_grpc_ping_timeout ping 等待时长，生成时转换为秒。
 * @property {boolean} transport_grpc_permit_without_stream 没有活动流时是否发送 ping。
 */
/**
 * @typedef {object} StreamSettings
 * @property {string|null} network 传输名称，选中传输后填充。
 * @property {object|null} xhttpSettings XHTTP 的传输选项。
 * @property {object|null} httpupgradeSettings HTTPUpgrade 的传输选项。
 * @property {object|null} wsSettings WebSocket 的传输选项。
 * @property {object|null} grpcSettings gRPC 的传输选项。
 */
/**
 * 将节点传输选项填入 Xray streamSettings。
 * @param {StreamSettings} stream Xray streamSettings，原地填充传输选项。
 * @param {TransportOptions} n 已经 UCI 解码并校验的传输字段。
 * @returns {null} 无业务返回值；原地修改 stream，未指定传输时跳过。
 */
export function apply(stream, n) {
	switch (n.transport_type) {
	case '': break;
	case 'xhttp':
		stream.network = 'xhttp';
		stream.xhttpSettings = {
			host: n.transport_xhttp_host, path: n.transport_xhttp_path || '/',
			mode: n.transport_xhttp_mode || 'auto', uplinkHTTPMethod: n.transport_xhttp_method,
		};
		break;
	case 'httpupgrade':
		stream.network = 'httpupgrade';
		stream.httpupgradeSettings = { host: n.transport_httpupgrade_host, path: n.transport_httpupgrade_path || '/' };
		break;
	case 'ws':
		let path = n.transport_ws_path || '/';
		if (n.transport_ws_max_early_data) {
			let hash = index(path, '#') ?? -1, base = hash < 0 ? path : substr(path, 0, hash);
			path = base + (index(base, '?') < 0 ? '?' : '&') + `ed=${n.transport_ws_max_early_data}` + (hash < 0 ? '' : substr(path, hash));
		}
		stream.network = 'websocket';
		stream.wsSettings = { host: n.transport_ws_host, path };
		break;
	case 'grpc':
		stream.network = 'grpc';
		stream.grpcSettings = {
			serviceName: n.transport_grpc_service_name || 'TunService',
			idle_timeout: int(duration(n.transport_grpc_idle_timeout)) || null,
			health_check_timeout: int(duration(n.transport_grpc_ping_timeout)) || null,
		};
		if (n.transport_grpc_permit_without_stream) stream.grpcSettings.permit_without_stream = true;
		break;
	default: die(`unsupported Xray transport "${n.transport_type}"`);
	}
};
