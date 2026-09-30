package protocol

import (
	"cmp"
	"fmt"

	uciprotocol "hijpass/config/uci/protocol"

	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func sbMultiplex(n uciprotocol.MultiplexOptions) *sb.OutboundMultiplexOptions {
	if !n.MultiplexEnabled {
		return nil
	}
	m := &sb.OutboundMultiplexOptions{Enabled: true, Protocol: n.MultiplexProtocol, MaxConnections: int(n.MaxConnections), MinStreams: int(n.MinStreams), MaxStreams: int(n.MaxStreams)}
	if n.BrutalEnabled {
		m.Brutal = &sb.BrutalOptions{Enabled: true, UpMbps: int(n.BrutalUp), DownMbps: int(n.BrutalDown)}
	}
	return m
}

func sbTransport(n uciprotocol.TransportOptions) (*sb.V2RayTransportOptions, error) {
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

func sbTLS(options uciprotocol.TLSOptions, server string) sb.OutboundTLSOptionsContainer {
	return sb.OutboundTLSOptionsContainer{TLS: &sb.OutboundTLSOptions{Enabled: true, ServerName: cmp.Or(options.TLSServerName, server), Insecure: bool(options.TLSInsecure)}}
}
