package singbox

import (
	"fmt"

	"hijpass/config/generator/protocol"

	sb "github.com/sagernet/sing-box/option"
)

func buildVLESS(n *protocol.VLESS, server sb.ServerOptions) (sb.Outbound, error) {
	o := sb.Outbound{Type: n.Type, Tag: n.Name}
	network := sb.NetworkList(n.Network)
	tls := sbTLS(n.TLSOptions, n.Server)
	tr, e := sbTransport(n.TransportOptions)
	if e != nil {
		return o, e
	}
	if n.RealityEnabled {
		if n.RealityPublicKey == "" {
			return o, fmt.Errorf("Reality public key is required")
		}
		tls.TLS.Reality = &sb.OutboundRealityOptions{Enabled: true, PublicKey: n.RealityPublicKey, ShortID: n.RealityShortID}
		tls.TLS.UTLS = &sb.OutboundUTLSOptions{Enabled: true, Fingerprint: "chrome"}
	}
	p := &sb.VLESSOutboundOptions{ServerOptions: server, UUID: n.UUID, Flow: n.Flow, Network: network, OutboundTLSOptionsContainer: tls, Transport: tr, Multiplex: sbMultiplex(n.MultiplexOptions)}
	if n.PacketEncoding != "" {
		p.PacketEncoding = new(n.PacketEncoding)
	}
	o.Options = p
	return o, nil
}
