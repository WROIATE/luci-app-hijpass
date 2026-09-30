package protocol

import (
	"fmt"

	uciprotocol "hijpass/config/uci/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func buildShadowsocks(n *uciprotocol.Shadowsocks) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: n.Type, Tag: n.Name}
	var e error
	if n.UDPOverTCP {
		return o, fmt.Errorf("Xray main no longer supports Shadowsocks udp_over_tcp; disable it or select sing-box")
	}
	o.Settings, e = RawSettings(xr.ShadowsocksClientConfig{Address: Address(n.Server), Port: n.ServerPort, Cipher: n.Method, Password: n.Password})

	return o, e
}
