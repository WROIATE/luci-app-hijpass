package protocol

import (
	"time"

	"hijpass/config/uci"
	"hijpass/config/uci/constant"
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

func init() { register("tuic", func() Config { return newTUIC() }) }

// DecodeUCI reads only options supported by TUIC.
func (n *TUIC) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	n.ServerOptions.decodeUCI(d)

	n.TLSOptions.decodeUCI(d)
	d.Text(constant.OptionPassword, &n.Password)
	d.Text(constant.OptionUUID, &n.UUID)
	d.Text(constant.OptionNetwork, &n.Network)
	d.Text(constant.OptionCongestionControl, &n.CongestionControl)
	d.Text(constant.OptionUDPRelayMode, &n.UDPRelayMode)
	d.Boolean(constant.OptionUDPOverStream, &n.UDPOverStream)
	d.Boolean(constant.OptionZeroRTTHandshake, &n.ZeroRTT)
	d.Duration(constant.OptionHeartbeat, &n.Heartbeat)
	return d.Err()
}
