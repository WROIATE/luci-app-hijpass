// Package protocol converts UCI proxy models to native sing-box outbounds.
package protocol

import (
	"fmt"

	uciprotocol "hijpass/config/uci/protocol"

	sb "github.com/sagernet/sing-box/option"
)

// Build converts a validated proxy model to its native outbound configuration.
func Build(node uciprotocol.RemoteConfig) (sb.Outbound, error) {
	o := sb.Outbound{Type: node.Base().Type, Tag: node.Base().Name}
	endpoint := node.Endpoint()
	server := sb.ServerOptions{Server: endpoint.Server, ServerPort: endpoint.ServerPort}
	switch n := node.(type) {
	case *uciprotocol.Shadowsocks:
		return buildShadowsocks(n, server)
	case *uciprotocol.Hysteria2:
		return buildHysteria2(n, server)
	case *uciprotocol.TUIC:
		return buildTUIC(n, server)
	case *uciprotocol.ShadowTLS:
		return buildShadowTLS(n, server)
	case *uciprotocol.VLESS:
		return buildVLESS(n, server)

	default:
		return o, fmt.Errorf("unsupported sing-box protocol %q", node.Base().Type)
	}
}
