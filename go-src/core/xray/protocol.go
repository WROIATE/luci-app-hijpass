package xray

import (
	"fmt"

	"hijpass/config/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func xrProtocol(node protocol.RemoteConfig) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: node.Base().Type, Tag: node.Base().Name}
	switch n := node.(type) {
	case *protocol.Shadowsocks:
		return buildShadowsocks(n)
	case *protocol.Hysteria2:
		return buildHysteria2(n)
	case *protocol.VLESS:
		return buildVLESS(n)

	default:
		return o, fmt.Errorf("unsupported Xray protocol %q", node.Base().Type)
	}
}
