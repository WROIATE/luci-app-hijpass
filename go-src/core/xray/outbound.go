package xray

import (
	"hijpass/config/core"

	xn "github.com/xtls/xray-core/common/net"
	xr "github.com/xtls/xray-core/infra/conf"
)

func Address(host string) *xr.Address { return &xr.Address{Address: xn.ParseAddress(host)} }

func Log(level string) *xr.LogConfig {
	if level == "warn" {
		level = "warning"
	}
	return &xr.LogConfig{LogLevel: core.Fallback(level, "info")}
}

func Socks(tag string, port uint16) (xr.OutboundDetourConfig, error) {
	s, e := core.RawSettings(xr.SocksClientConfig{Address: Address("127.0.0.1"), Port: port})
	return xr.OutboundDetourConfig{Protocol: "socks", Tag: tag, Settings: s}, e
}
