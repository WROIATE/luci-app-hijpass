package protocol

// Shared capabilities are embedded only by protocols that support them.
type BaseOptions struct {
	ID         string `json:".name"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Core       string `json:"core"`
	ListenPort Int    `json:"listen_port"`
	SocksPort  Int    `json:"socks_port"`
	LogLevel   string `json:"log_level"`
}

type ServerOptions struct {
	Server     string `json:"server"`
	ServerPort Int    `json:"server_port"`
	Upstream   string `json:"upstream_proxy_node"`
}

type TLSOptions struct {
	TLSServerName string `json:"tls_server_name"`
	TLSInsecure   Bool   `json:"tls_insecure"`
}

type RealityOptions struct {
	RealityEnabled   Bool   `json:"tls_reality_enabled"`
	RealityPublicKey string `json:"tls_reality_public_key"`
	RealityShortID   string `json:"tls_reality_short_id"`
}

type MultiplexOptions struct {
	MultiplexEnabled  Bool   `json:"multiplex_enabled"`
	MultiplexProtocol string `json:"multiplex_protocol"`
	MaxConnections    Int    `json:"multiplex_max_connections"`
	MinStreams        Int    `json:"multiplex_min_streams"`
	MaxStreams        Int    `json:"multiplex_max_streams"`
	BrutalEnabled     Bool   `json:"multiplex_brutal_enabled"`
	BrutalUp          Int    `json:"multiplex_brutal_up_mbps"`
	BrutalDown        Int    `json:"multiplex_brutal_down_mbps"`
}

type TransportOptions struct {
	Transport     string   `json:"transport_type"`
	HTTPHost      string   `json:"transport_http_host"`
	HTTPPath      string   `json:"transport_http_path"`
	HTTPMethod    string   `json:"transport_http_method"`
	HTTPIdle      Duration `json:"transport_http_idle_timeout"`
	HTTPPing      Duration `json:"transport_http_ping_timeout"`
	WSHost        string   `json:"transport_ws_host"`
	WSPath        string   `json:"transport_ws_path"`
	WSEarlyData   Int      `json:"transport_ws_max_early_data"`
	WSEarlyHeader string   `json:"transport_ws_early_data_header_name"`
	GRPCService   string   `json:"transport_grpc_service_name"`
	GRPCIdle      Duration `json:"transport_grpc_idle_timeout"`
	GRPCPing      Duration `json:"transport_grpc_ping_timeout"`
	GRPCPermit    Bool     `json:"transport_grpc_permit_without_stream"`
	UpgradeHost   string   `json:"transport_httpupgrade_host"`
	UpgradePath   string   `json:"transport_httpupgrade_path"`
	XHTTPHost     string   `json:"transport_xhttp_host"`
	XHTTPPath     string   `json:"transport_xhttp_path"`
	XHTTPMode     string   `json:"transport_xhttp_mode"`
}
