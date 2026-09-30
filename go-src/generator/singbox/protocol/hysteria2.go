package protocol

import (
	"strings"

	uciprotocol "hijpass/config/uci/protocol"

	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func buildHysteria2(n *uciprotocol.Hysteria2, server sb.ServerOptions) (sb.Outbound, error) {
	o := sb.Outbound{Type: n.Type, Tag: n.Name}
	network := sb.NetworkList(n.Network)
	tls := sbTLS(n.TLSOptions, n.Server)
	p := &sb.Hysteria2OutboundOptions{
		ServerOptions:               server,
		Password:                    n.Password,
		UpMbps:                      intValue(n.UpMbps),
		DownMbps:                    intValue(n.DownMbps),
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

func intValue(v *int64) int {
	if v == nil {
		return 0
	}
	return int(*v)
}
