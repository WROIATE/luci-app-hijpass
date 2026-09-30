package xray

import (
	"encoding/json"
	"fmt"

	"hijpass/config/generator/coreconfig"
	"hijpass/config/generator/protocol"

	xn "github.com/xtls/xray-core/common/net"
	xr "github.com/xtls/xray-core/infra/conf"
)

func Address(host string) *xr.Address { return &xr.Address{Address: xn.ParseAddress(host)} }

func Log(level string) *xr.LogConfig {
	if level == "warn" {
		level = "warning"
	}
	return &xr.LogConfig{LogLevel: Fallback(level, "info")}
}

func Socks(tag string, port uint16) (xr.OutboundDetourConfig, error) {
	s, e := RawSettings(xr.SocksClientConfig{Address: Address(coreconfig.LoopbackAddress), Port: port})
	return xr.OutboundDetourConfig{Protocol: "socks", Tag: tag, Settings: s}, e
}

func Fallback(s, defaultValue string) string {
	if s == "" {
		return defaultValue
	}
	return s
}
func RawSettings(v any) (*json.RawMessage, error) {
	b, e := json.Marshal(v)
	if e != nil {
		return nil, e
	}
	r := json.RawMessage(b)
	return &r, nil
}

// buildRemote adds the protocol outbound and its optional upstream SOCKS hop.
func buildRemote(config *xr.Config, node protocol.RemoteConfig) error {
	out, err := xrProtocol(node)
	if err != nil {
		return err
	}
	if upstream := node.Endpoint().Upstream; upstream != nil {
		port := upstream.Base().SocksPort
		tag := coreconfig.UpstreamPrefix + upstream.Base().Name
		if out.StreamSetting == nil {
			out.StreamSetting = &xr.StreamConfig{}
		}
		out.StreamSetting.SocketSettings = &xr.SocketConfig{DialerProxy: tag, DomainStrategy: domainStrategyUseIP}
		socks, err := Socks(tag, port)
		if err != nil {
			return err
		}
		config.OutboundConfigs = []xr.OutboundDetourConfig{out, socks}
	} else {
		config.OutboundConfigs = []xr.OutboundDetourConfig{out}
	}
	return nil
}

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
