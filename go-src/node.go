package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"
)

// UCI's numeric/boolean options are strings on the wire. Decode them once at the
// boundary so builders operate on typed fields and cannot silently truncate ports.
type uciInt int64

func (v *uciInt) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s == "" {
		*v = 0
		return nil
	}
	n, e := strconv.ParseInt(s, 10, 64)
	if e != nil || n < 0 {
		return fmt.Errorf("invalid nonnegative integer %q", s)
	}
	*v = uciInt(n)
	return nil
}

type uciBool bool

func (v *uciBool) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s != "" && s != "0" && s != "1" {
		return fmt.Errorf("invalid UCI boolean %q", s)
	}
	*v = s == "1"
	return nil
}

type uciDuration time.Duration

func (v *uciDuration) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s == "" {
		*v = 0
		return nil
	}
	d, e := time.ParseDuration(s)
	if e != nil || d < 0 {
		return fmt.Errorf("invalid duration %q", s)
	}
	*v = uciDuration(d)
	return nil
}

type uciFloat float64

func (v *uciFloat) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s == "" {
		*v = 0
		return nil
	}
	n, e := strconv.ParseFloat(s, 64)
	if e != nil || n < 0 || math.IsNaN(n) || math.IsInf(n, 0) {
		return fmt.Errorf("invalid number %q", s)
	}
	*v = uciFloat(n)
	return nil
}

type stringList []string

func (v *stringList) UnmarshalJSON(b []byte) error {
	var s string
	if json.Unmarshal(b, &s) == nil {
		if s != "" {
			*v = []string{s}
		}
		return nil
	}
	return json.Unmarshal(b, (*[]string)(v))
}

type proxyNode struct {
	ID                   string      `json:".name"`
	Name                 string      `json:"name"`
	Type                 string      `json:"type"`
	Core                 string      `json:"core"`
	Server               string      `json:"server"`
	ServerPort           uciInt      `json:"server_port"`
	ListenPort           uciInt      `json:"listen_port"`
	SocksPort            uciInt      `json:"socks_port"`
	Upstream             string      `json:"upstream_proxy_node"`
	LogLevel             string      `json:"log_level"`
	Password             string      `json:"password"`
	UUID                 string      `json:"uuid"`
	Method               string      `json:"method"`
	Network              string      `json:"network"`
	Plugin               string      `json:"plugin"`
	PluginOptions        string      `json:"plugin_opts"`
	UDPOverTCP           uciBool     `json:"udp_over_tcp"`
	UpMbps               *uciInt     `json:"up_mbps"`
	DownMbps             *uciInt     `json:"down_mbps"`
	UDPIdleTimeout       uciInt      `json:"udp_idle_timeout"`
	ServerPorts          stringList  `json:"server_ports"`
	HopInterval          uciDuration `json:"hop_interval"`
	ObfsType             string      `json:"obfs_type"`
	ObfsPassword         string      `json:"obfs_password"`
	CongestionControl    string      `json:"congestion_control"`
	UDPRelayMode         string      `json:"udp_relay_mode"`
	UDPOverStream        uciBool     `json:"udp_over_stream"`
	ZeroRTT              uciBool     `json:"zero_rtt_handshake"`
	Heartbeat            uciDuration `json:"heartbeat"`
	ShadowTLSVersion     uciInt      `json:"version"`
	Flow                 string      `json:"flow"`
	PacketEncoding       string      `json:"packet_encoding"`
	TLSServerName        string      `json:"tls_server_name"`
	TLSInsecure          uciBool     `json:"tls_insecure"`
	RealityEnabled       uciBool     `json:"tls_reality_enabled"`
	RealityPublicKey     string      `json:"tls_reality_public_key"`
	RealityShortID       string      `json:"tls_reality_short_id"`
	MultiplexEnabled     uciBool     `json:"multiplex_enabled"`
	MultiplexProtocol    string      `json:"multiplex_protocol"`
	MaxConnections       uciInt      `json:"multiplex_max_connections"`
	MinStreams           uciInt      `json:"multiplex_min_streams"`
	MaxStreams           uciInt      `json:"multiplex_max_streams"`
	BrutalEnabled        uciBool     `json:"multiplex_brutal_enabled"`
	BrutalUp             uciInt      `json:"multiplex_brutal_up_mbps"`
	BrutalDown           uciInt      `json:"multiplex_brutal_down_mbps"`
	Transport            string      `json:"transport_type"`
	HTTPHost             string      `json:"transport_http_host"`
	HTTPPath             string      `json:"transport_http_path"`
	HTTPMethod           string      `json:"transport_http_method"`
	HTTPIdle             uciDuration `json:"transport_http_idle_timeout"`
	HTTPPing             uciDuration `json:"transport_http_ping_timeout"`
	WSHost               string      `json:"transport_ws_host"`
	WSPath               string      `json:"transport_ws_path"`
	WSEarlyData          uciInt      `json:"transport_ws_max_early_data"`
	WSEarlyHeader        string      `json:"transport_ws_early_data_header_name"`
	GRPCService          string      `json:"transport_grpc_service_name"`
	GRPCIdle             uciDuration `json:"transport_grpc_idle_timeout"`
	GRPCPing             uciDuration `json:"transport_grpc_ping_timeout"`
	GRPCPermit           uciBool     `json:"transport_grpc_permit_without_stream"`
	UpgradeHost          string      `json:"transport_httpupgrade_host"`
	UpgradePath          string      `json:"transport_httpupgrade_path"`
	XHTTPHost            string      `json:"transport_xhttp_host"`
	XHTTPPath            string      `json:"transport_xhttp_path"`
	XHTTPMode            string      `json:"transport_xhttp_mode"`
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

func parseNode(s section) (proxyNode, error) {
	n := proxyNode{Core: core(s), LogLevel: "info", MultiplexProtocol: "h2mux", Strategy: "leastLoad", StrategyExpected: 1, StrategyMaxRTT: uciDuration(time.Second), StrategyTolerance: 0.05, ProbeURL: "https://connectivitycheck.gstatic.com/generate_204", ProbeInterval: uciDuration(time.Minute), ProbeTimeout: uciDuration(2 * time.Second), ProbeSampling: 3}
	switch s.str("type") {
	case "vless":
		n.Network = "tcp"
		n.HTTPIdle = uciDuration(15 * time.Second)
		n.HTTPPing = n.HTTPIdle
		n.GRPCIdle = n.HTTPIdle
		n.GRPCPing = n.HTTPIdle
	case "tuic":
		n.CongestionControl = "cubic"
		n.Heartbeat = uciDuration(10 * time.Second)
	case "shadowtls":
		n.ShadowTLSVersion = 1
	}
	b, e := json.Marshal(s)
	if e != nil {
		return n, e
	}
	if e = json.Unmarshal(b, &n); e != nil {
		return n, e
	}
	n.Core = core(s)
	for _, p := range []struct {
		name  string
		value uciInt
	}{{"listen_port", n.ListenPort}, {"socks_port", n.SocksPort}} {
		if p.value < 1 || p.value > 65535 {
			return n, fmt.Errorf("invalid %s", p.name)
		}
	}
	if n.Type != "load_balance" && (n.Server == "" || n.ServerPort < 1 || n.ServerPort > 65535) {
		return n, fmt.Errorf("invalid server or server_port")
	}
	if n.Tolerance > 65535 || uint64(n.WSEarlyData) > 4294967295 {
		return n, fmt.Errorf("numeric option out of range")
	}
	// The same UCI must have the same interpretation on 32- and 64-bit routers.
	for _, value := range []uciInt{n.MaxConnections, n.MinStreams, n.MaxStreams, n.BrutalUp, n.BrutalDown, n.ShadowTLSVersion, n.StrategyExpected, n.ProbeSampling} {
		if value > math.MaxInt32 {
			return n, fmt.Errorf("integer option exceeds 32-bit range")
		}
	}
	for _, value := range []*uciInt{n.UpMbps, n.DownMbps} {
		if value != nil && *value > math.MaxInt32 {
			return n, fmt.Errorf("bandwidth exceeds 32-bit range")
		}
	}
	for _, value := range []uciDuration{n.GRPCIdle, n.GRPCPing} {
		if time.Duration(value)/time.Second > math.MaxInt32 {
			return n, fmt.Errorf("gRPC timeout exceeds 32-bit range")
		}
	}
	return n, nil
}
func fallback(s, defaultValue string) string {
	if s == "" {
		return defaultValue
	}
	return s
}

func intValue(v *uciInt) int {
	if v == nil {
		return 0
	}
	return int(*v)
}
