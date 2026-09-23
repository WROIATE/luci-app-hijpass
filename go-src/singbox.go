package main

import (
	"fmt"
	"hijpass/config/protocol"
	"net/netip"
	"strings"

	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func sbListen(port uint16, address string) sb.ListenOptions {
	return sb.ListenOptions{Listen: ptr(badoption.Addr(netip.MustParseAddr(address))), ListenPort: port}
}
func sbInbounds(n protocol.BaseOptions) []sb.Inbound {
	return []sb.Inbound{
		{Type: "tproxy", Tag: "tproxy-in", Options: &sb.TProxyInboundOptions{ListenOptions: sbListen(uint16(n.ListenPort), "127.0.0.1")}},
		{Type: "socks", Tag: "socks-in", Options: &sb.SocksInboundOptions{ListenOptions: sbListen(uint16(n.SocksPort), "127.0.0.1")}},
	}
}
func sbSocks(tag string, port uint16) sb.Outbound {
	return sb.Outbound{Type: "socks", Tag: tag, Options: &sb.SOCKSOutboundOptions{ServerOptions: sb.ServerOptions{Server: "127.0.0.1", ServerPort: port}, Version: "5"}}
}
func sbMultiplex(n protocol.MultiplexOptions) *sb.OutboundMultiplexOptions {
	if !n.MultiplexEnabled {
		return nil
	}
	m := &sb.OutboundMultiplexOptions{Enabled: true, Protocol: n.MultiplexProtocol, MaxConnections: int(n.MaxConnections), MinStreams: int(n.MinStreams), MaxStreams: int(n.MaxStreams)}
	if n.BrutalEnabled {
		m.Brutal = &sb.BrutalOptions{Enabled: true, UpMbps: int(n.BrutalUp), DownMbps: int(n.BrutalDown)}
	}
	return m
}
func sbTransport(n protocol.TransportOptions) (*sb.V2RayTransportOptions, error) {
	t := &sb.V2RayTransportOptions{Type: n.Transport}
	switch n.Transport {
	case "":
		return nil, nil
	case "http":
		t.HTTPOptions = sb.V2RayHTTPOptions{Path: n.HTTPPath, Method: n.HTTPMethod, IdleTimeout: badoption.Duration(n.HTTPIdle), PingTimeout: badoption.Duration(n.HTTPPing)}
		if n.HTTPHost != "" {
			t.HTTPOptions.Host = []string{n.HTTPHost}
		}
	case "ws":
		t.WebsocketOptions = sb.V2RayWebsocketOptions{Path: n.WSPath, MaxEarlyData: uint32(n.WSEarlyData), EarlyDataHeaderName: n.WSEarlyHeader}
		if n.WSHost != "" {
			t.WebsocketOptions.Headers = badoption.HTTPHeader{"Host": {n.WSHost}}
		}
	case "grpc":
		t.GRPCOptions = sb.V2RayGRPCOptions{ServiceName: n.GRPCService, IdleTimeout: badoption.Duration(n.GRPCIdle), PingTimeout: badoption.Duration(n.GRPCPing), PermitWithoutStream: bool(n.GRPCPermit)}
	case "httpupgrade":
		t.HTTPUpgradeOptions = sb.V2RayHTTPUpgradeOptions{Host: n.UpgradeHost, Path: n.UpgradePath}
	default:
		return nil, fmt.Errorf("unsupported sing-box transport %q", n.Transport)
	}
	return t, nil
}
func sbProtocol(node protocol.RemoteConfig) (sb.Outbound, error) {
	o := sb.Outbound{Type: node.Base().Type, Tag: node.Base().Name}
	endpoint := node.Endpoint()
	server := sb.ServerOptions{Server: endpoint.Server, ServerPort: uint16(endpoint.ServerPort)}
	switch n := node.(type) {
	case *protocol.Shadowsocks:
		network := sb.NetworkList(n.Network)
		p := &sb.ShadowsocksOutboundOptions{ServerOptions: server, Method: n.Method, Password: n.Password, Network: network, Plugin: n.Plugin, PluginOptions: n.PluginOptions, Multiplex: sbMultiplex(n.MultiplexOptions)}
		if n.UDPOverTCP {
			p.UDPOverTCP = &sb.UDPOverTCPOptions{Enabled: true}
		}
		o.Options = p
	case *protocol.Hysteria2:
		network := sb.NetworkList(n.Network)
		tls := sbTLS(n.TLSOptions, n.Server)
		p := &sb.Hysteria2OutboundOptions{
			ServerOptions:               server,
			Password:                    n.Password,
			UpMbps:                      intValue(n.UpMbps),
			DownMbps:                    intValue(n.DownMbps),
			HopInterval:                 badoption.Duration(n.HopInterval),
			Network:                     network,
			OutboundTLSOptionsContainer: tls,
		}
		for _, r := range n.ServerPorts {
			p.ServerPorts = append(p.ServerPorts, strings.Replace(r, "-", ":", 1))
		}
		if n.ObfsType == "salamander" && n.ObfsPassword != "" {
			p.Obfs = &sb.Hysteria2Obfs{Type: "salamander", Password: n.ObfsPassword}
		}
		o.Options = p
	case *protocol.TUIC:
		network := sb.NetworkList(n.Network)
		tls := sbTLS(n.TLSOptions, n.Server)
		o.Options = &sb.TUICOutboundOptions{
			ServerOptions:               server,
			UUID:                        n.UUID,
			Password:                    n.Password,
			CongestionControl:           n.CongestionControl,
			UDPRelayMode:                n.UDPRelayMode,
			UDPOverStream:               bool(n.UDPOverStream),
			ZeroRTTHandshake:            bool(n.ZeroRTT),
			Heartbeat:                   badoption.Duration(n.Heartbeat),
			Network:                     network,
			OutboundTLSOptionsContainer: tls,
		}
	case *protocol.ShadowTLS:
		tls := sbTLS(n.TLSOptions, n.Server)
		o.Options = &sb.ShadowTLSOutboundOptions{ServerOptions: server, Version: int(n.ShadowTLSVersion), Password: n.Password, OutboundTLSOptionsContainer: tls}
	case *protocol.VLESS:
		network := sb.NetworkList(n.Network)
		tls := sbTLS(n.TLSOptions, n.Server)
		tr, e := sbTransport(n.TransportOptions)
		if e != nil {
			return o, e
		}
		if n.RealityEnabled {
			if n.RealityPublicKey == "" {
				return o, fmt.Errorf("Reality public key is required")
			}
			tls.TLS.Reality = &sb.OutboundRealityOptions{Enabled: true, PublicKey: n.RealityPublicKey, ShortID: n.RealityShortID}
			tls.TLS.UTLS = &sb.OutboundUTLSOptions{Enabled: true, Fingerprint: "chrome"}
		}
		p := &sb.VLESSOutboundOptions{ServerOptions: server, UUID: n.UUID, Flow: n.Flow, Network: network, OutboundTLSOptionsContainer: tls, Transport: tr, Multiplex: sbMultiplex(n.MultiplexOptions)}
		if n.PacketEncoding != "" {
			p.PacketEncoding = ptr(n.PacketEncoding)
		}
		o.Options = p
	default:
		return o, fmt.Errorf("unsupported sing-box protocol %q", node.Base().Type)
	}
	return o, nil
}
func (c config) singboxProxy(node protocol.Config) (*coreConfig, error) {
	base := node.Base()
	options := &sb.Options{
		Log: &sb.LogOptions{
			Level:     fallback(base.LogLevel, "info"),
			Timestamp: true,
		},
		Inbounds: sbInbounds(*base),
		DNS: &sb.DNSOptions{
			RawDNSOptions: sb.RawDNSOptions{
				Servers: []sb.DNSServerOptions{
					{
						Type:    "local",
						Tag:     "local",
						Options: &sb.LocalDNSServerOptions{},
					},
				},
			},
		},
		Route: &sb.RouteOptions{
			DefaultDomainResolver: &sb.DomainResolveOptions{Server: "local"},
		},
	}
	if n, ok := node.(*protocol.LoadBalance); ok {
		lb := &sb.URLTestOutboundOptions{URL: n.URL, Interval: badoption.Duration(n.Interval), Tolerance: uint16(n.Tolerance), IdleTimeout: badoption.Duration(n.IdleTimeout), InterruptExistConnections: bool(n.InterruptConnections)}
		options.Outbounds = append(options.Outbounds, sb.Outbound{Type: "urltest", Tag: "slb", Options: lb})
		for i, name := range n.Members {
			s, e := c.node(name)
			if e != nil {
				return nil, e
			}
			tag := fmt.Sprintf("lb-member-%d", i)
			lb.Outbounds = append(lb.Outbounds, tag)
			options.Outbounds = append(options.Outbounds, sbSocks(tag, uint16(s.num("socks_port"))))
		}
		options.Route.Final = "slb"
	} else {
		remote, ok := node.(protocol.RemoteConfig)
		if !ok {
			return nil, fmt.Errorf("unsupported remote proxy %T", node)
		}
		out, e := sbProtocol(remote)
		endpoint := remote.Endpoint()
		if e != nil {
			return nil, e
		}
		options.Outbounds = append(options.Outbounds, out)
		if endpoint.Upstream != "" {
			up, e := c.node(endpoint.Upstream)
			if e != nil {
				return nil, e
			}
			tag := "upstream-" + endpoint.Upstream
			dialer := out.Options.(sb.DialerOptionsWrapper)
			d := dialer.TakeDialerOptions()
			d.Detour = tag
			dialer.ReplaceDialerOptions(d)
			options.Outbounds = append(options.Outbounds, sbSocks(tag, uint16(up.num("socks_port"))))
		}
	}
	return &coreConfig{SingBox: options}, nil
}

func sbTLS(options protocol.TLSOptions, server string) sb.OutboundTLSOptionsContainer {
	return sb.OutboundTLSOptionsContainer{TLS: &sb.OutboundTLSOptions{Enabled: true, ServerName: fallback(options.TLSServerName, server), Insecure: bool(options.TLSInsecure)}}
}
