// Package uci adapts flat UCI JSON options to protocol models.
package uci

import (
	"encoding/json"
	"hijpass/config/protocol"
)

// DecodeNode reads only the selected protocol's options. Missing options retain
// defaults; stale options from a previously selected protocol are ignored.
func DecodeNode(data []byte) (protocol.Node, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, err
	}
	d := decoder{fields: fields}
	var kind string
	d.text("type", &kind)
	if d.err != nil {
		return nil, d.err
	}
	node, err := protocol.New(kind)
	if err != nil {
		return nil, err
	}
	d.baseOptions(node.Base())
	if remote, ok := node.(protocol.RemoteNode); ok {
		d.serverOptions(remote.Endpoint())
	}
	switch n := node.(type) {
	case *protocol.Shadowsocks:
		d.multiplexOptions(&n.MultiplexOptions)
		d.text("password", &n.Password)
		d.text("network", &n.Network)
		d.text("method", &n.Method)
		d.text("plugin", &n.Plugin)
		d.text("plugin_opts", &n.PluginOptions)
		d.boolean("udp_over_tcp", &n.UDPOverTCP)
	case *protocol.Hysteria2:
		d.tlsOptions(&n.TLSOptions)
		d.text("password", &n.Password)
		d.text("network", &n.Network)
		d.optionalInteger("up_mbps", &n.UpMbps)
		d.optionalInteger("down_mbps", &n.DownMbps)
		d.integer("udp_idle_timeout", &n.UDPIdleTimeout)
		d.list("server_ports", &n.ServerPorts)
		d.duration("hop_interval", &n.HopInterval)
		d.text("obfs_type", &n.ObfsType)
		d.text("obfs_password", &n.ObfsPassword)
	case *protocol.TUIC:
		d.tlsOptions(&n.TLSOptions)
		d.text("password", &n.Password)
		d.text("uuid", &n.UUID)
		d.text("network", &n.Network)
		d.text("congestion_control", &n.CongestionControl)
		d.text("udp_relay_mode", &n.UDPRelayMode)
		d.boolean("udp_over_stream", &n.UDPOverStream)
		d.boolean("zero_rtt_handshake", &n.ZeroRTT)
		d.duration("heartbeat", &n.Heartbeat)
	case *protocol.ShadowTLS:
		d.tlsOptions(&n.TLSOptions)
		d.text("password", &n.Password)
		d.integer("version", &n.ShadowTLSVersion)
	case *protocol.VLESS:
		d.tlsOptions(&n.TLSOptions)
		d.realityOptions(&n.RealityOptions)
		d.multiplexOptions(&n.MultiplexOptions)
		d.transportOptions(&n.TransportOptions)
		d.text("uuid", &n.UUID)
		d.text("network", &n.Network)
		d.text("flow", &n.Flow)
		d.text("packet_encoding", &n.PacketEncoding)
	case *protocol.LoadBalance:
		d.list("member_node", &n.Members)
		d.text("url", &n.URL)
		d.duration("interval", &n.Interval)
		d.integer("tolerance", &n.Tolerance)
		d.duration("idle_timeout", &n.IdleTimeout)
		d.boolean("interrupt_exist_connections", &n.InterruptConnections)
		d.text("strategy", &n.Strategy)
		d.integer("strategy_expected", &n.StrategyExpected)
		d.duration("strategy_max_rtt", &n.StrategyMaxRTT)
		d.number("strategy_tolerance", &n.StrategyTolerance)
		d.text("fallback_tag", &n.Fallback)
		d.text("probe_url", &n.ProbeURL)
		d.text("probe_connectivity", &n.ProbeConnectivity)
		d.duration("probe_interval", &n.ProbeInterval)
		d.duration("probe_timeout", &n.ProbeTimeout)
		d.integer("probe_sampling", &n.ProbeSampling)
		d.text("probe_http_method", &n.ProbeMethod)
	}
	if d.err != nil {
		return nil, d.err
	}
	if err := protocol.Validate(node); err != nil {
		return nil, err
	}
	return node, nil
}

func (d *decoder) baseOptions(n *protocol.BaseOptions) {
	d.text(".name", &n.ID)
	d.text("name", &n.Name)
	d.text("type", &n.Type)
	d.text("core", &n.Core)
	d.integer("listen_port", &n.ListenPort)
	d.integer("socks_port", &n.SocksPort)
	d.text("log_level", &n.LogLevel)
}

func (d *decoder) serverOptions(n *protocol.ServerOptions) {
	d.text("server", &n.Server)
	d.integer("server_port", &n.ServerPort)
	d.text("upstream_proxy_node", &n.Upstream)
}

func (d *decoder) tlsOptions(n *protocol.TLSOptions) {
	d.text("tls_server_name", &n.TLSServerName)
	d.boolean("tls_insecure", &n.TLSInsecure)
}

func (d *decoder) realityOptions(n *protocol.RealityOptions) {
	d.boolean("tls_reality_enabled", &n.RealityEnabled)
	d.text("tls_reality_public_key", &n.RealityPublicKey)
	d.text("tls_reality_short_id", &n.RealityShortID)
}

func (d *decoder) multiplexOptions(n *protocol.MultiplexOptions) {
	d.boolean("multiplex_enabled", &n.MultiplexEnabled)
	d.text("multiplex_protocol", &n.MultiplexProtocol)
	d.integer("multiplex_max_connections", &n.MaxConnections)
	d.integer("multiplex_min_streams", &n.MinStreams)
	d.integer("multiplex_max_streams", &n.MaxStreams)
	d.boolean("multiplex_brutal_enabled", &n.BrutalEnabled)
	d.integer("multiplex_brutal_up_mbps", &n.BrutalUp)
	d.integer("multiplex_brutal_down_mbps", &n.BrutalDown)
}

func (d *decoder) transportOptions(n *protocol.TransportOptions) {
	d.text("transport_type", &n.Transport)
	d.text("transport_http_host", &n.HTTPHost)
	d.text("transport_http_path", &n.HTTPPath)
	d.text("transport_http_method", &n.HTTPMethod)
	d.duration("transport_http_idle_timeout", &n.HTTPIdle)
	d.duration("transport_http_ping_timeout", &n.HTTPPing)
	d.text("transport_ws_host", &n.WSHost)
	d.text("transport_ws_path", &n.WSPath)
	d.integer("transport_ws_max_early_data", &n.WSEarlyData)
	d.text("transport_ws_early_data_header_name", &n.WSEarlyHeader)
	d.text("transport_grpc_service_name", &n.GRPCService)
	d.duration("transport_grpc_idle_timeout", &n.GRPCIdle)
	d.duration("transport_grpc_ping_timeout", &n.GRPCPing)
	d.boolean("transport_grpc_permit_without_stream", &n.GRPCPermit)
	d.text("transport_httpupgrade_host", &n.UpgradeHost)
	d.text("transport_httpupgrade_path", &n.UpgradePath)
	d.text("transport_xhttp_host", &n.XHTTPHost)
	d.text("transport_xhttp_path", &n.XHTTPPath)
	d.text("transport_xhttp_mode", &n.XHTTPMode)
}
