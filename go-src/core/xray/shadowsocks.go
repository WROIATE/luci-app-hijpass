package xray

import (
	"fmt"

	"hijpass/config/core"
	"hijpass/config/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func buildShadowsocks(n *protocol.Shadowsocks) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: n.Type, Tag: n.Name}
	var e error
	if n.UDPOverTCP {
		return o, fmt.Errorf("Xray main no longer supports Shadowsocks udp_over_tcp; disable it or select sing-box")
	}
	o.Settings, e = core.RawSettings(xr.ShadowsocksClientConfig{Address: Address(n.Server), Port: uint16(n.ServerPort), Cipher: n.Method, Password: n.Password})

	return o, e
}
