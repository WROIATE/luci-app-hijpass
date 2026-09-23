package main

import (
	"encoding/json"
	"fmt"
	xn "github.com/xtls/xray-core/common/net"
	xr "github.com/xtls/xray-core/infra/conf"
	"hijpass/config/protocol"
	"net/url"
	"strings"
	"time"
)

// Xray's healthCheckSettings is private. Decode a typed wire adapter into the
// native BurstObservatoryConfig rather than constructing untyped JSON objects.
type xrayBurstOptions struct {
	SubjectSelector []string `json:"subjectSelector"`
	PingConfig      xrayPing `json:"pingConfig"`
}
type xrayPing struct {
	Destination  string `json:"destination"`
	Connectivity string `json:"connectivity,omitempty"`
	Interval     string `json:"interval"`
	Timeout      string `json:"timeout"`
	Sampling     int    `json:"sampling"`
	HTTPMethod   string `json:"httpMethod,omitempty"`
}
type xrayLeastLoad struct {
	Expected  int     `json:"expected"`
	MaxRTT    string  `json:"maxRTT"`
	Tolerance float64 `json:"tolerance"`
}

func xrAddress(host string) *xr.Address { return &xr.Address{Address: xn.ParseAddress(host)} }
func xrLog(level string) *xr.LogConfig {
	if level == "warn" {
		level = "warning"
	}
	return &xr.LogConfig{LogLevel: fallback(level, "info")}
}
func xrInbound(typ, tag string, port uint16, shunt bool) (xr.InboundDetourConfig, error) {

	o := xr.InboundDetourConfig{Tag: tag, PortList: &xr.PortList{Range: []xr.PortRange{{From: uint32(port), To: uint32(port)}}}}
	var e error
	if typ == "socks" {
		o.Protocol = "socks"
		o.Settings, e = rawSettings(xr.SocksServerConfig{UDP: true})
	} else {
		o.Protocol = "dokodemo-door"
		d := xr.DokodemoConfig{Network: ptr(xr.NetworkList{"tcp", "udp"})}
		if typ == "tproxy" {
			d.FollowRedirect = true
			o.StreamSetting = &xr.StreamConfig{SocketSettings: &xr.SocketConfig{TProxy: "tproxy"}}
		} else {
			o.ListenOn = xrAddress("::")
		}
		o.Settings, e = rawSettings(d)
	}
	if shunt && typ == "tproxy" {
		o.SniffingConfig = &xr.SniffingConfig{Enabled: true, DestOverride: xr.StringList{"http", "tls", "quic"}, RouteOnly: true}
	}
	return o, e
}
func xrSocks(tag string, port uint16) (xr.OutboundDetourConfig, error) {
	s, e := rawSettings(xr.SocksClientConfig{Address: xrAddress("127.0.0.1"), Port: port})
	return xr.OutboundDetourConfig{Protocol: "socks", Tag: tag, Settings: s}, e
}
func xrProtocol(node protocol.RemoteNode) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: node.Base().Type, Tag: node.Base().Name}
	var e error
	switch n := node.(type) {
	case *protocol.Shadowsocks:
		if n.UDPOverTCP {
			return o, fmt.Errorf("Xray main no longer supports Shadowsocks udp_over_tcp; disable it or select sing-box")
		}
		o.Settings, e = rawSettings(xr.ShadowsocksClientConfig{Address: xrAddress(n.Server), Port: uint16(n.ServerPort), Cipher: n.Method, Password: n.Password})
	case *protocol.Hysteria2:
		o.Protocol = "hysteria"
		o.Settings, e = rawSettings(xr.HysteriaClientConfig{Version: 2, Address: xrAddress(n.Server), Port: uint16(n.ServerPort)})
		o.StreamSetting = &xr.StreamConfig{
			Network:  ptr(xr.TransportProtocol("hysteria")),
			Security: "tls",
			TLSSettings: &xr.TLSConfig{
				ServerName: fallback(n.TLSServerName,
					n.Server),
				ALPN: ptr(xr.StringList{"h3"}),
			},
			HysteriaSettings: &xr.HysteriaConfig{
				Version:        2,
				Auth:           n.Password,
				UdpIdleTimeout: int64(n.UDPIdleTimeout),
			},
		}
		if n.UpMbps != nil || n.DownMbps != nil {
			o.StreamSetting.FinalMask = &xr.FinalMask{QuicParams: &xr.QuicParamsConfig{BrutalUp: xrBandwidth(n.UpMbps), BrutalDown: xrBandwidth(n.DownMbps)}}
		}
	case *protocol.VLESS:
		o.Settings, e = rawSettings(xr.VLessOutboundConfig{Address: xrAddress(n.Server), Port: uint16(n.ServerPort), Id: n.UUID, Encryption: "none", Flow: n.Flow})
		st := &xr.StreamConfig{Network: ptr(xr.TransportProtocol("raw")), Security: "none"}
		o.StreamSetting = st
		if n.RealityEnabled {
			st.Security = "reality"
			st.REALITYSettings = &xr.REALITYConfig{Fingerprint: "chrome", ServerName: fallback(n.TLSServerName, n.Server), Password: n.RealityPublicKey, ShortId: n.RealityShortID}
		} else if n.TLSServerName != "" {
			st.Security = "tls"
			st.TLSSettings = &xr.TLSConfig{ServerName: n.TLSServerName, ALPN: ptr(xr.StringList{"h2", "http/1.1"})}
		}
		switch n.Transport {
		case "":
		case "xhttp":
			st.Network = ptr(xr.TransportProtocol("xhttp"))
			st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.XHTTPHost, Path: fallback(n.XHTTPPath, "/"), Mode: fallback(n.XHTTPMode, "auto")}
		case "http":
			st.Network = ptr(xr.TransportProtocol("xhttp"))
			st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.HTTPHost, Path: fallback(n.HTTPPath, "/"), Mode: "stream-one", UplinkHTTPMethod: n.HTTPMethod}
		case "httpupgrade":
			st.Network = ptr(xr.TransportProtocol("httpupgrade"))
			st.HTTPUPGRADESettings = &xr.HttpUpgradeConfig{Host: n.UpgradeHost, Path: fallback(n.UpgradePath, "/")}
		case "ws":
			p := fallback(n.WSPath, "/")
			if n.WSEarlyData > 0 {
				base, hash, hasHash := strings.Cut(p, "#")
				sep := "?"
				if strings.Contains(base, "?") {
					sep = "&"
				}
				p = base + sep + "ed=" + url.QueryEscape(fmt.Sprint(n.WSEarlyData))
				if hasHash {
					p += "#" + hash
				}
			}
			st.Network = ptr(xr.TransportProtocol("websocket"))
			st.WSSettings = &xr.WebSocketConfig{Host: n.WSHost, Path: p}
		case "grpc":
			st.Network = ptr(xr.TransportProtocol("grpc"))
			st.GRPCSettings = &xr.GRPCConfig{
				ServiceName:         fallback(n.GRPCService, "TunService"),
				IdleTimeout:         int32(time.Duration(n.GRPCIdle) / time.Second),
				HealthCheckTimeout:  int32(time.Duration(n.GRPCPing) / time.Second),
				PermitWithoutStream: bool(n.GRPCPermit),
			}
		default:
			return o, fmt.Errorf("unsupported Xray transport %q", n.Transport)
		}
	default:
		return o, fmt.Errorf("unsupported Xray protocol %q", node.Base().Type)
	}
	return o, e
}
func xrBandwidth(v *protocol.Int) xr.Bandwidth {
	if v == nil {
		return ""
	}
	if *v == 0 {
		return "0"
	}
	return xr.Bandwidth(fmt.Sprintf("%d mbps", *v))
}
func (c config) xrayProxy(node protocol.Node) (*coreConfig, error) {
	base := node.Base()
	x := &xr.Config{LogConfig: xrLog(base.LogLevel)}
	for _, p := range []struct {
		typ, tag string
		port     protocol.Int
	}{{"tproxy", "tproxy-in", base.ListenPort}, {"socks", "socks-in", base.SocksPort}} {
		in, e := xrInbound(p.typ, p.tag, uint16(p.port), false)
		if e != nil {
			return nil, e
		}
		x.InboundConfigs = append(x.InboundConfigs, in)
	}
	if n, ok := node.(*protocol.LoadBalance); ok {
		fb := "lb-member-0"
		for i, name := range n.Members {
			s, e := c.node(name)
			if e != nil {
				return nil, e
			}
			tag := fmt.Sprintf("lb-member-%d", i)
			if name == n.Fallback {
				fb = tag
			}
			o, e := xrSocks(tag, uint16(s.num("socks_port")))
			if e != nil {
				return nil, e
			}
			x.OutboundConfigs = append(x.OutboundConfigs, o)
		}
		strategy := xr.StrategyConfig{Type: n.Strategy}
		if n.Strategy == "leastLoad" {
			s, e := rawSettings(xrayLeastLoad{int(n.StrategyExpected), time.Duration(n.StrategyMaxRTT).String(), float64(n.StrategyTolerance)})
			if e != nil {
				return nil, e
			}
			strategy.Settings = s
		}
		rr, e := json.Marshal(xrayRouteRule{InboundTag: []string{"tproxy-in", "socks-in"}, BalancerTag: "slb"})
		if e != nil {
			return nil, e
		}
		x.RouterConfig = &xr.RouterConfig{DomainStrategy: ptr("AsIs"), RuleList: []json.RawMessage{rr}, Balancers: []*xr.BalancingRule{{Tag: "slb", Selectors: xr.StringList{"lb-member-"}, FallbackTag: fb, Strategy: strategy}}}
		burst := xrayBurstOptions{
			SubjectSelector: []string{"lb-member-"},
			PingConfig: xrayPing{
				Destination:  n.ProbeURL,
				Connectivity: n.ProbeConnectivity,
				Interval:     time.Duration(n.ProbeInterval).String(),
				Timeout:      time.Duration(n.ProbeTimeout).String(),
				Sampling:     int(n.ProbeSampling),
				HTTPMethod:   n.ProbeMethod,
			},
		}
		data, e := json.Marshal(burst)
		if e != nil {
			return nil, e
		}
		x.BurstObservatory = &xr.BurstObservatoryConfig{}
		if e = json.Unmarshal(data, x.BurstObservatory); e != nil {
			return nil, e
		}
	} else {
		remote, ok := node.(protocol.RemoteNode)
		if !ok {
			return nil, fmt.Errorf("unsupported remote proxy %T", node)
		}
		out, e := xrProtocol(remote)
		endpoint := remote.Endpoint()
		if e != nil {
			return nil, e
		}
		if endpoint.Upstream != "" {
			up, e := c.node(endpoint.Upstream)
			if e != nil {
				return nil, e
			}
			tag := "upstream-" + endpoint.Upstream
			if out.StreamSetting == nil {
				out.StreamSetting = &xr.StreamConfig{}
			}
			out.StreamSetting.SocketSettings = &xr.SocketConfig{DialerProxy: tag, DomainStrategy: "UseIP"}
			socks, e := xrSocks(tag, uint16(up.num("socks_port")))
			if e != nil {
				return nil, e
			}
			x.OutboundConfigs = []xr.OutboundDetourConfig{out, socks}
		} else {
			x.OutboundConfigs = []xr.OutboundDetourConfig{out}
		}
	}
	return &coreConfig{Xray: x}, nil
}
