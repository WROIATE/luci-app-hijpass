package protocol

import (
	"time"

	"hijpass/config/uci"
	"hijpass/config/uci/constant"
)

const TypeVLESS = "vless"

// VLESS contains only the options supported by this proxy type.
type VLESS struct {
	BaseOptions
	ServerOptions
	TLSOptions
	RealityOptions
	MultiplexOptions
	TransportOptions
	UUID           string
	Network        string
	Flow           string
	PacketEncoding string
}

func (n *VLESS) Validate() error {
	if e := n.validateMultiplex(); e != nil {
		return e
	}
	return n.validateTransport()
}

func newVLESS() *VLESS {
	return &VLESS{
		Network: "tcp", MultiplexProtocol: "h2mux",
		HTTPIdle: 15 * time.Second, HTTPPing: 15 * time.Second, GRPCIdle: 15 * time.Second, GRPCPing: 15 * time.Second,
	}
}

func init() { register(TypeVLESS, func() Config { return newVLESS() }) }

// DecodeUCI reads only options supported by VLESS.
func (n *VLESS) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	n.ServerOptions.decodeUCI(d)

	n.TLSOptions.decodeUCI(d)
	n.RealityOptions.decodeUCI(d)
	n.MultiplexOptions.decodeUCI(d)
	n.TransportOptions.decodeUCI(d)
	d.Text(constant.OptionUUID, &n.UUID)
	d.Text(constant.OptionNetwork, &n.Network)
	d.Text(constant.OptionFlow, &n.Flow)
	d.Text(constant.OptionPacketEncoding, &n.PacketEncoding)
	return d.Err()
}
