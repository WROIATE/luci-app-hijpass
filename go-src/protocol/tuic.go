package protocol

import "time"

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
