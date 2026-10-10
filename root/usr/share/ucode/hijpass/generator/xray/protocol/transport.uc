// streamSettings.network 为 Xray 原生传输名；HTTP 已迁移到 XHTTP stream-one。
// WS 的 early data 通过 URL 的 ed 参数传递，必须保留已有 query 和 fragment。
export function apply(stream, n) {
	switch (n.transport_type) {
	case '': break;
	case 'xhttp':
		stream.network = 'xhttp';
		stream.xhttpSettings = { host: n.transport_xhttp_host, path: n.transport_xhttp_path || '/', mode: n.transport_xhttp_mode || 'auto' };
		break;
	case 'http':
		stream.network = 'xhttp';
		stream.xhttpSettings = { host: n.transport_http_host, path: n.transport_http_path || '/', mode: 'stream-one', uplinkHTTPMethod: n.transport_http_method };
		break;
	case 'httpupgrade':
		stream.network = 'httpupgrade';
		stream.httpupgradeSettings = { host: n.transport_httpupgrade_host, path: n.transport_httpupgrade_path || '/' };
		break;
	case 'ws':
		let path = n.transport_ws_path || '/';
		if (n.transport_ws_max_early_data) {
			let hash = index(path, '#'), base = hash < 0 ? path : substr(path, 0, hash);
			path = base + (index(base, '?') < 0 ? '?' : '&') + `ed=${n.transport_ws_max_early_data}` + (hash < 0 ? '' : substr(path, hash));
		}
		stream.network = 'websocket';
		stream.wsSettings = { host: n.transport_ws_host, path };
		break;
	case 'grpc':
		stream.network = 'grpc';
		stream.grpcSettings = {
			serviceName: n.transport_grpc_service_name || 'TunService',
			idle_timeout: int(n.transport_grpc_idle_timeout),
			health_check_timeout: int(n.transport_grpc_ping_timeout),
			permit_without_stream: n.transport_grpc_permit_without_stream,
		};
		break;
	default: die(`unsupported Xray transport "${n.transport_type}"`);
	}
};
