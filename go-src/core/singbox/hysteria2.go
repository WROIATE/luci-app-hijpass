package singbox

import (
	"strings"

	"hijpass/config/core"
	"hijpass/config/protocol"

	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func buildHysteria2(n *protocol.Hysteria2, server sb.ServerOptions) (sb.Outbound, error) {
	o := sb.Outbound{Type: n.Type, Tag: n.Name}
	network := sb.NetworkList(n.Network)
	tls := sbTLS(n.TLSOptions, n.Server)
	p := &sb.Hysteria2OutboundOptions{
		ServerOptions:               server,
		Password:                    n.Password,
		UpMbps:                      core.IntValue(n.UpMbps),
		DownMbps:                    core.IntValue(n.DownMbps),
		HopInterval:                 badoption.Duration(n.HopInterval),
		Network:                     network,
		OutboundTLSOptionsContainer: tls,
	}
	for _, r := range n.ServerPorts {
		p.ServerPorts = append(p.ServerPorts, strings.Replace(r, "-", ":", 1))
	}
	if n.ObfsType == "salamander" && n.ObfsPassword != "" {
		p.Obfs = &sb.Hysteria2Obfs{Type: "salamander", Password: n.ObfsPassword}
	}
	o.Options = p

	return o, nil
}
