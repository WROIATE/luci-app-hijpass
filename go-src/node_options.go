package main

// Shared capabilities are embedded only by protocols that support them.
type nodeBase struct {
	ID         string `json:".name"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Core       string `json:"core"`
	ListenPort uciInt `json:"listen_port"`
	SocksPort  uciInt `json:"socks_port"`
	LogLevel   string `json:"log_level"`
}

type nodeServer struct {
	Server     string `json:"server"`
	ServerPort uciInt `json:"server_port"`
	Upstream   string `json:"upstream_proxy_node"`
}

type tlsOptions struct {
	TLSServerName string  `json:"tls_server_name"`
	TLSInsecure   uciBool `json:"tls_insecure"`
}

type realityOptions struct {
	RealityEnabled   uciBool `json:"tls_reality_enabled"`
	RealityPublicKey string  `json:"tls_reality_public_key"`
	RealityShortID   string  `json:"tls_reality_short_id"`
}

type multiplexOptions struct {
	MultiplexEnabled  uciBool `json:"multiplex_enabled"`
	MultiplexProtocol string  `json:"multiplex_protocol"`
	MaxConnections    uciInt  `json:"multiplex_max_connections"`
	MinStreams        uciInt  `json:"multiplex_min_streams"`
	MaxStreams        uciInt  `json:"multiplex_max_streams"`
	BrutalEnabled     uciBool `json:"multiplex_brutal_enabled"`
	BrutalUp          uciInt  `json:"multiplex_brutal_up_mbps"`
	BrutalDown        uciInt  `json:"multiplex_brutal_down_mbps"`
}

type transportOptions struct {
	Transport     string      `json:"transport_type"`
	HTTPHost      string      `json:"transport_http_host"`
	HTTPPath      string      `json:"transport_http_path"`
	HTTPMethod    string      `json:"transport_http_method"`
	HTTPIdle      uciDuration `json:"transport_http_idle_timeout"`
	HTTPPing      uciDuration `json:"transport_http_ping_timeout"`
	WSHost        string      `json:"transport_ws_host"`
	WSPath        string      `json:"transport_ws_path"`
	WSEarlyData   uciInt      `json:"transport_ws_max_early_data"`
	WSEarlyHeader string      `json:"transport_ws_early_data_header_name"`
	GRPCService   string      `json:"transport_grpc_service_name"`
	GRPCIdle      uciDuration `json:"transport_grpc_idle_timeout"`
	GRPCPing      uciDuration `json:"transport_grpc_ping_timeout"`
	GRPCPermit    uciBool     `json:"transport_grpc_permit_without_stream"`
	UpgradeHost   string      `json:"transport_httpupgrade_host"`
	UpgradePath   string      `json:"transport_httpupgrade_path"`
	XHTTPHost     string      `json:"transport_xhttp_host"`
	XHTTPPath     string      `json:"transport_xhttp_path"`
	XHTTPMode     string      `json:"transport_xhttp_mode"`
}
