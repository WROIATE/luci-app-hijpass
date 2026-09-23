package protocol

import "time"

// TUIC contains only the options supported by this proxy type.
type TUIC struct {
	BaseOptions
	ServerOptions
	TLSOptions
	Password          string   `json:"password"`
	UUID              string   `json:"uuid"`
	Network           string   `json:"network"`
	CongestionControl string   `json:"congestion_control"`
	UDPRelayMode      string   `json:"udp_relay_mode"`
	UDPOverStream     Bool     `json:"udp_over_stream"`
	ZeroRTT           Bool     `json:"zero_rtt_handshake"`
	Heartbeat         Duration `json:"heartbeat"`
}

func (n *TUIC) Validate() error { return nil }

func newTUIC() *TUIC { return &TUIC{CongestionControl: "cubic", Heartbeat: Duration(10 * time.Second)} }
