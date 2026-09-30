// Package protocol converts UCI proxy models to native Xray outbounds.
package protocol

import (
	"fmt"

	uciprotocol "hijpass/config/uci/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

// Build converts a validated proxy model to its native outbound configuration.
func Build(node uciprotocol.RemoteConfig) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: node.Base().Type, Tag: node.Base().Name}
	switch n := node.(type) {
	case *uciprotocol.Shadowsocks:
		return buildShadowsocks(n)
	case *uciprotocol.Hysteria2:
		return buildHysteria2(n)
	case *uciprotocol.VLESS:
		return buildVLESS(n)

	default:
		return o, fmt.Errorf("unsupported Xray protocol %q", node.Base().Type)
	}
}
