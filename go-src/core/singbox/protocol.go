package singbox

import (
	"fmt"

	"hijpass/config/protocol"

	sb "github.com/sagernet/sing-box/option"
)

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
