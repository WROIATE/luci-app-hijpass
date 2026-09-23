package protocol

import (
	"hijpass/config/uci"
	"time"
)

// TUIC contains only the options supported by this proxy type.
type TUIC struct {
	BaseOptions
	ServerOptions
	TLSOptions
	Password          string
	UUID              string
	Network           string
	CongestionControl string
	UDPRelayMode      string
	UDPOverStream     bool
	ZeroRTT           bool
	Heartbeat         time.Duration
}

func (n *TUIC) Validate() error { return nil }

func newTUIC() *TUIC { return &TUIC{CongestionControl: "cubic", Heartbeat: 10 * time.Second} }

func init() { register("tuic", func() Node { return newTUIC() }) }

// DecodeUCI reads only options supported by TUIC.
func (n *TUIC) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	n.ServerOptions.decodeUCI(d)

	n.TLSOptions.decodeUCI(d)
	d.Text("password", &n.Password)
	d.Text("uuid", &n.UUID)
	d.Text("network", &n.Network)
	d.Text("congestion_control", &n.CongestionControl)
	d.Text("udp_relay_mode", &n.UDPRelayMode)
	d.Boolean("udp_over_stream", &n.UDPOverStream)
	d.Boolean("zero_rtt_handshake", &n.ZeroRTT)
	d.Duration("heartbeat", &n.Heartbeat)
	return d.Err()
}
