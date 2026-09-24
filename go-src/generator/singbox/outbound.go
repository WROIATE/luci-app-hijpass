package singbox

import (
	"fmt"

	"hijpass/config/generator/protocol"

	sb "github.com/sagernet/sing-box/option"
)

func Socks(tag string, port uint16) sb.Outbound {
	return sb.Outbound{Type: "socks", Tag: tag, Options: &sb.SOCKSOutboundOptions{ServerOptions: sb.ServerOptions{Server: "127.0.0.1", ServerPort: port}, Version: "5"}}
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
func Ptr[T any](v T) *T { return &v }

func sbProtocol(node protocol.RemoteConfig) (sb.Outbound, error) {
	o := sb.Outbound{Type: node.Base().Type, Tag: node.Base().Name}
	endpoint := node.Endpoint()
	server := sb.ServerOptions{Server: endpoint.Server, ServerPort: uint16(endpoint.ServerPort)}
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
