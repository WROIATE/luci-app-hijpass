package singbox

import (
	"hijpass/config/generator/protocol"

	sb "github.com/sagernet/sing-box/option"
)

func buildShadowsocks(n *protocol.Shadowsocks, server sb.ServerOptions) (sb.Outbound, error) {
	o := sb.Outbound{Type: n.Type, Tag: n.Name}
	network := sb.NetworkList(n.Network)
	p := &sb.ShadowsocksOutboundOptions{ServerOptions: server, Method: n.Method, Password: n.Password, Network: network, Plugin: n.Plugin, PluginOptions: n.PluginOptions, Multiplex: sbMultiplex(n.MultiplexOptions)}
	if n.UDPOverTCP {
		p.UDPOverTCP = &sb.UDPOverTCPOptions{Enabled: true}
	}
	o.Options = p

	return o, nil
}
