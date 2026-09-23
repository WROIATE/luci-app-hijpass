package main

// These value structs describe the flat UCI input. Anonymous embedding keeps
// existing JSON keys and lets each builder accept only its relevant options.
type nodeBase struct {
	ID         string `json:".name"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Core       string `json:"core"`
	ListenPort uciInt `json:"listen_port"`
	SocksPort  uciInt `json:"socks_port"`
	Upstream   string `json:"upstream_proxy_node"`
	LogLevel   string `json:"log_level"`
}

type nodeServer struct {
	Server     string `json:"server"`
	ServerPort uciInt `json:"server_port"`
	Network    string `json:"network"`
}

type nodeCredentials struct {
	Password string `json:"password"`
	UUID     string `json:"uuid"`
}

type shadowsocksOptions struct {
	Method        string  `json:"method"`
	Plugin        string  `json:"plugin"`
	PluginOptions string  `json:"plugin_opts"`
	UDPOverTCP    uciBool `json:"udp_over_tcp"`
}

type hysteriaOptions struct {
	UpMbps         *uciInt     `json:"up_mbps"`
	DownMbps       *uciInt     `json:"down_mbps"`
	UDPIdleTimeout uciInt      `json:"udp_idle_timeout"`
	ServerPorts    stringList  `json:"server_ports"`
	HopInterval    uciDuration `json:"hop_interval"`
	ObfsType       string      `json:"obfs_type"`
	ObfsPassword   string      `json:"obfs_password"`
}

type tuicOptions struct {
	CongestionControl string      `json:"congestion_control"`
	UDPRelayMode      string      `json:"udp_relay_mode"`
	UDPOverStream     uciBool     `json:"udp_over_stream"`
	ZeroRTT           uciBool     `json:"zero_rtt_handshake"`
	Heartbeat         uciDuration `json:"heartbeat"`
}

type shadowTLSOptions struct {
	ShadowTLSVersion uciInt `json:"version"`
}

type vlessOptions struct {
	Flow           string `json:"flow"`
	PacketEncoding string `json:"packet_encoding"`
}

type tlsOptions struct {
	TLSServerName    string  `json:"tls_server_name"`
	TLSInsecure      uciBool `json:"tls_insecure"`
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

type loadBalanceOptions struct {
	Members              stringList  `json:"member_node"`
	URL                  string      `json:"url"`
	Interval             uciDuration `json:"interval"`
	Tolerance            uciInt      `json:"tolerance"`
	IdleTimeout          uciDuration `json:"idle_timeout"`
	InterruptConnections uciBool     `json:"interrupt_exist_connections"`
	Strategy             string      `json:"strategy"`
	StrategyExpected     uciInt      `json:"strategy_expected"`
	StrategyMaxRTT       uciDuration `json:"strategy_max_rtt"`
	StrategyTolerance    uciFloat    `json:"strategy_tolerance"`
	Fallback             string      `json:"fallback_tag"`
}

type probeOptions struct {
	ProbeURL          string      `json:"probe_url"`
	ProbeConnectivity string      `json:"probe_connectivity"`
	ProbeInterval     uciDuration `json:"probe_interval"`
	ProbeTimeout      uciDuration `json:"probe_timeout"`
	ProbeSampling     uciInt      `json:"probe_sampling"`
	ProbeMethod       string      `json:"probe_http_method"`
}
