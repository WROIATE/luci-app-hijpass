package protocol

import (
	"time"

	"hijpass/config/uci"
)

// BaseOptions Shared capabilities are embedded only by protocols that support them.
type BaseOptions struct {
	ID         string
	Name       string
	Type       string
	Core       string
	ListenPort uint16
	SocksPort  uint16
	LogLevel   string
}

type ServerOptions struct {
	Server     string
	ServerPort uint16
	Upstream   Config // Linked by the generator after decoding.
}

type TLSOptions struct {
	TLSServerName string
	TLSInsecure   bool
}

type RealityOptions struct {
	RealityEnabled   bool
	RealityPublicKey string
	RealityShortID   string
}

type MultiplexOptions struct {
	MultiplexEnabled  bool
	MultiplexProtocol string
	MaxConnections    int64
	MinStreams        int64
	MaxStreams        int64
	BrutalEnabled     bool
	BrutalUp          int64
	BrutalDown        int64
}

type TransportOptions struct {
	Transport     string
	HTTPHost      string
	HTTPPath      string
	HTTPMethod    string
	HTTPIdle      time.Duration
	HTTPPing      time.Duration
	WSHost        string
	WSPath        string
	WSEarlyData   int64
	WSEarlyHeader string
	GRPCService   string
	GRPCIdle      time.Duration
	GRPCPing      time.Duration
	GRPCPermit    bool
	UpgradeHost   string
	UpgradePath   string
	XHTTPHost     string
	XHTTPPath     string
	XHTTPMode     string
}

func (n *BaseOptions) decodeUCI(d *uci.Decoder) {
	d.Text(uci.SectionName, &n.ID)
	d.Text(uci.OptionName, &n.Name)
	d.Text(uci.OptionType, &n.Type)
	d.Text("core", &n.Core)
	d.Port("listen_port", &n.ListenPort)
	d.Port("socks_port", &n.SocksPort)
	d.Text("log_level", &n.LogLevel)
}

func (n *ServerOptions) decodeUCI(d *uci.Decoder) {
	d.Text("server", &n.Server)
	d.Port("server_port", &n.ServerPort)
}

func (n *TLSOptions) decodeUCI(d *uci.Decoder) {
	d.Text("tls_server_name", &n.TLSServerName)
	d.Boolean("tls_insecure", &n.TLSInsecure)
}

func (n *RealityOptions) decodeUCI(d *uci.Decoder) {
	d.Boolean("tls_reality_enabled", &n.RealityEnabled)
	d.Text("tls_reality_public_key", &n.RealityPublicKey)
	d.Text("tls_reality_short_id", &n.RealityShortID)
}

func (n *MultiplexOptions) decodeUCI(d *uci.Decoder) {
	d.Boolean("multiplex_enabled", &n.MultiplexEnabled)
	d.Text("multiplex_protocol", &n.MultiplexProtocol)
	d.Integer("multiplex_max_connections", &n.MaxConnections)
	d.Integer("multiplex_min_streams", &n.MinStreams)
	d.Integer("multiplex_max_streams", &n.MaxStreams)
	d.Boolean("multiplex_brutal_enabled", &n.BrutalEnabled)
	d.Integer("multiplex_brutal_up_mbps", &n.BrutalUp)
	d.Integer("multiplex_brutal_down_mbps", &n.BrutalDown)
}

func (n *TransportOptions) decodeUCI(d *uci.Decoder) {
	d.Text("transport_type", &n.Transport)
	d.Text("transport_http_host", &n.HTTPHost)
	d.Text("transport_http_path", &n.HTTPPath)
	d.Text("transport_http_method", &n.HTTPMethod)
	d.Duration("transport_http_idle_timeout", &n.HTTPIdle)
	d.Duration("transport_http_ping_timeout", &n.HTTPPing)
	d.Text("transport_ws_host", &n.WSHost)
	d.Text("transport_ws_path", &n.WSPath)
	d.Integer("transport_ws_max_early_data", &n.WSEarlyData)
	d.Text("transport_ws_early_data_header_name", &n.WSEarlyHeader)
	d.Text("transport_grpc_service_name", &n.GRPCService)
	d.Duration("transport_grpc_idle_timeout", &n.GRPCIdle)
	d.Duration("transport_grpc_ping_timeout", &n.GRPCPing)
	d.Boolean("transport_grpc_permit_without_stream", &n.GRPCPermit)
	d.Text("transport_httpupgrade_host", &n.UpgradeHost)
	d.Text("transport_httpupgrade_path", &n.UpgradePath)
	d.Text("transport_xhttp_host", &n.XHTTPHost)
	d.Text("transport_xhttp_path", &n.XHTTPPath)
	d.Text("transport_xhttp_mode", &n.XHTTPMode)
}
