package singbox

import (
	"fmt"

	"hijpass/config/generator/constant"
	"hijpass/config/generator/protocol"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
)

func Socks(tag string, port uint16) sb.Outbound {
	return sb.Outbound{Type: C.TypeSOCKS, Tag: tag, Options: &sb.SOCKSOutboundOptions{Server: constant.LoopbackAddress, ServerPort: port, Version: "5"}}
}

func Fallback(s, defaultValue string) string {
	if s == "" {
		return defaultValue
	}
	return s
}
func IntValue(v *int64) int {
	if v == nil {
		return 0
	}
	return int(*v)
}

// buildRemote adds the protocol outbound and its optional upstream SOCKS hop.
func buildRemote(options *sb.Options, node protocol.RemoteConfig) error {
	out, err := sbProtocol(node)
	if err != nil {
		return err
	}
	options.Outbounds = append(options.Outbounds, out)
	if upstream := node.Endpoint().Upstream; upstream != nil {
		port := upstream.Base().SocksPort
		tag := constant.UpstreamPrefix + upstream.Base().Name
		dialer := out.Options.(sb.DialerOptionsWrapper)
		d := dialer.TakeDialerOptions()
		d.Detour = tag
		dialer.ReplaceDialerOptions(d)
		options.Outbounds = append(options.Outbounds, Socks(tag, port))
	}
	return nil
}

func sbProtocol(node protocol.RemoteConfig) (sb.Outbound, error) {
	o := sb.Outbound{Type: node.Base().Type, Tag: node.Base().Name}
	endpoint := node.Endpoint()
	server := sb.ServerOptions{Server: endpoint.Server, ServerPort: endpoint.ServerPort}
	switch n := node.(type) {
	case *protocol.Shadowsocks:
		return buildShadowsocks(n, server)
	case *protocol.Hysteria2:
		return buildHysteria2(n, server)
	case *protocol.TUIC:
		return buildTUIC(n, server)
	case *protocol.ShadowTLS:
		return buildShadowTLS(n, server)
	case *protocol.VLESS:
		return buildVLESS(n, server)

	default:
		return o, fmt.Errorf("unsupported sing-box protocol %q", node.Base().Type)
	}
}
