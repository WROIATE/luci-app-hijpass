package main

// Each concrete node owns only the fields applicable to its proxy protocol.
type shadowsocksNode struct {
	nodeBase
	nodeServer
	multiplexOptions
	Password      string  `json:"password"`
	Network       string  `json:"network"`
	Method        string  `json:"method"`
	Plugin        string  `json:"plugin"`
	PluginOptions string  `json:"plugin_opts"`
	UDPOverTCP    uciBool `json:"udp_over_tcp"`
}

type hysteria2Node struct {
	nodeBase
	nodeServer
	tlsOptions
	Password       string      `json:"password"`
	Network        string      `json:"network"`
	UpMbps         *uciInt     `json:"up_mbps"`
	DownMbps       *uciInt     `json:"down_mbps"`
	UDPIdleTimeout uciInt      `json:"udp_idle_timeout"`
	ServerPorts    stringList  `json:"server_ports"`
	HopInterval    uciDuration `json:"hop_interval"`
	ObfsType       string      `json:"obfs_type"`
	ObfsPassword   string      `json:"obfs_password"`
}

type tuicNode struct {
	nodeBase
	nodeServer
	tlsOptions
	Password          string      `json:"password"`
	UUID              string      `json:"uuid"`
	Network           string      `json:"network"`
	CongestionControl string      `json:"congestion_control"`
	UDPRelayMode      string      `json:"udp_relay_mode"`
	UDPOverStream     uciBool     `json:"udp_over_stream"`
	ZeroRTT           uciBool     `json:"zero_rtt_handshake"`
	Heartbeat         uciDuration `json:"heartbeat"`
}

type shadowTLSNode struct {
	nodeBase
	nodeServer
	tlsOptions
	Password         string `json:"password"`
	ShadowTLSVersion uciInt `json:"version"`
}

type vlessNode struct {
	nodeBase
	nodeServer
	tlsOptions
	realityOptions
	multiplexOptions
	transportOptions
	UUID           string `json:"uuid"`
	Network        string `json:"network"`
	Flow           string `json:"flow"`
	PacketEncoding string `json:"packet_encoding"`
}

type loadBalanceNode struct {
	nodeBase
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
	ProbeURL             string      `json:"probe_url"`
	ProbeConnectivity    string      `json:"probe_connectivity"`
	ProbeInterval        uciDuration `json:"probe_interval"`
	ProbeTimeout         uciDuration `json:"probe_timeout"`
	ProbeSampling        uciInt      `json:"probe_sampling"`
	ProbeMethod          string      `json:"probe_http_method"`
}
