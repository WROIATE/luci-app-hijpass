// 共享字段只由支持该能力的协议组合；每个对象均是明确的字段声明。
export const BaseOptions = {
	".name": ["text", ""], // 字符串，ID
	name: ["text", ""], // 字符串，Name
	type: ["text", ""], // 字符串，Type
	core: ["text", ""], // 字符串，Core
	listen_port: ["port", 0], // 端口 1–65535，ListenPort
	socks_port: ["port", 0], // 端口 1–65535，SocksPort
	log_level: ["text", "info"], // 字符串，LogLevel
};

export const ServerOptions = {
	server: ["text", ""], // 字符串，Server
	server_port: ["port", 0], // 端口 1–65535，ServerPort
};

export const TLSOptions = {
	tls_server_name: ["text", ""], // 字符串，TLSServerName
	tls_insecure: ["bool", false], // UCI 0/1 开关，TLSInsecure
};

export const RealityOptions = {
	tls_reality_enabled: ["bool", false], // UCI 0/1 开关，RealityEnabled
	tls_reality_public_key: ["text", ""], // 字符串，RealityPublicKey
	tls_reality_short_id: ["text", ""], // 字符串，RealityShortID
};

export const MultiplexOptions = {
	multiplex_enabled: ["bool", false], // UCI 0/1 开关，MultiplexEnabled
	multiplex_protocol: ["text", "h2mux"], // 字符串，MultiplexProtocol
	multiplex_max_connections: ["integer", 0, 2147483647], // 非负整数，MaxConnections
	multiplex_min_streams: ["integer", 0, 2147483647], // 非负整数，MinStreams
	multiplex_max_streams: ["integer", 0, 2147483647], // 非负整数，MaxStreams
	multiplex_brutal_enabled: ["bool", false], // UCI 0/1 开关，BrutalEnabled
	multiplex_brutal_up_mbps: ["integer", 0, 2147483647], // 非负整数，单位 Mbps，BrutalUp
	multiplex_brutal_down_mbps: ["integer", 0, 2147483647], // 非负整数，单位 Mbps，BrutalDown
};

export const TransportOptions = {
	transport_type: ["text", ""], // 字符串，Transport
	transport_http_host: ["text", ""], // 字符串，HTTPHost
	transport_http_path: ["text", ""], // 字符串，HTTPPath
	transport_http_method: ["text", ""], // 字符串，HTTPMethod
	transport_http_idle_timeout: ["duration", 15], // 时长字符串，解码后单位为秒，HTTPIdle
	transport_http_ping_timeout: ["duration", 15], // 时长字符串，解码后单位为秒，HTTPPing
	transport_ws_host: ["text", ""], // 字符串，WSHost
	transport_ws_path: ["text", ""], // 字符串，WSPath
	transport_ws_max_early_data: ["integer", 0, 4294967295], // 非负整数，WSEarlyData
	transport_ws_early_data_header_name: ["text", ""], // 字符串，WSEarlyHeader
	transport_grpc_service_name: ["text", ""], // 字符串，GRPCService
	transport_grpc_idle_timeout: ["duration", 15], // 时长字符串，解码后单位为秒，GRPCIdle
	transport_grpc_ping_timeout: ["duration", 15], // 时长字符串，解码后单位为秒，GRPCPing
	transport_grpc_permit_without_stream: ["bool", false], // UCI 0/1 开关，GRPCPermit
	transport_httpupgrade_host: ["text", ""], // 字符串，UpgradeHost
	transport_httpupgrade_path: ["text", ""], // 字符串，UpgradePath
	transport_xhttp_host: ["text", ""], // 字符串，XHTTPHost
	transport_xhttp_path: ["text", ""], // 字符串，XHTTPPath
	transport_xhttp_mode: ["text", ""], // 字符串，XHTTPMode
};

