package protocol

import (
	"hijpass/config/generator/constant"

	xr "github.com/xtls/xray-core/infra/conf"
)

// Socks builds an outbound to a local proxy listener.
func Socks(tag string, port uint16) (xr.OutboundDetourConfig, error) {
	s, e := RawSettings(xr.SocksClientConfig{Address: Address(constant.LoopbackAddress), Port: port})
	return xr.OutboundDetourConfig{Protocol: "socks", Tag: tag, Settings: s}, e
}
