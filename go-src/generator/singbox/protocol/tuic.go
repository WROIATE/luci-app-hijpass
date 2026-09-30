package protocol

import (
	uciprotocol "hijpass/config/uci/protocol"

	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func buildTUIC(n *uciprotocol.TUIC, server sb.ServerOptions) (sb.Outbound, error) {
	o := sb.Outbound{Type: n.Type, Tag: n.Name}
	network := sb.NetworkList(n.Network)
	tls := sbTLS(n.TLSOptions, n.Server)
	o.Options = &sb.TUICOutboundOptions{
		ServerOptions:               server,
		UUID:                        n.UUID,
		Password:                    n.Password,
		CongestionControl:           n.CongestionControl,
		UDPRelayMode:                n.UDPRelayMode,
		UDPOverStream:               bool(n.UDPOverStream),
		ZeroRTTHandshake:            bool(n.ZeroRTT),
		Heartbeat:                   badoption.Duration(n.Heartbeat),
		Network:                     network,
		OutboundTLSOptionsContainer: tls,
	}

	return o, nil
}
