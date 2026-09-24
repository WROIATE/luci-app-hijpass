package singbox

import (
	"hijpass/config/generator/protocol"

	sb "github.com/sagernet/sing-box/option"
)

func buildShadowTLS(n *protocol.ShadowTLS, server sb.ServerOptions) (sb.Outbound, error) {
	o := sb.Outbound{Type: n.Type, Tag: n.Name}
	tls := sbTLS(n.TLSOptions, n.Server)
	o.Options = &sb.ShadowTLSOutboundOptions{ServerOptions: server, Version: int(n.ShadowTLSVersion), Password: n.Password, OutboundTLSOptionsContainer: tls}

	return o, nil
}
