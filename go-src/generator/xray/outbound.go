package xray

import (
	"hijpass/config/generator/constant"
	"hijpass/config/generator/xray/protocol"
	uciprotocol "hijpass/config/uci/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

// buildRemote adds the protocol outbound and its optional upstream SOCKS hop.
func buildRemote(config *xr.Config, node uciprotocol.RemoteConfig) error {
	out, err := protocol.Build(node)
	if err != nil {
		return err
	}
	if upstream := node.Endpoint().Upstream; upstream != nil {
		port := upstream.Base().SocksPort
		tag := constant.UpstreamPrefix + upstream.Base().Name
		if out.StreamSetting == nil {
			out.StreamSetting = &xr.StreamConfig{}
		}
		out.StreamSetting.SocketSettings = &xr.SocketConfig{DialerProxy: tag, DomainStrategy: domainStrategyUseIP}
		socks, err := protocol.Socks(tag, port)
		if err != nil {
			return err
		}
		config.OutboundConfigs = []xr.OutboundDetourConfig{out, socks}
	} else {
		config.OutboundConfigs = []xr.OutboundDetourConfig{out}
	}
	return nil
}
