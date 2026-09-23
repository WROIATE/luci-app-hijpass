package protocol

import "time"

// VLESS contains only the options supported by this proxy type.
type VLESS struct {
	BaseOptions
	ServerOptions
	TLSOptions
	RealityOptions
	MultiplexOptions
	TransportOptions
	UUID           string `json:"uuid"`
	Network        string `json:"network"`
	Flow           string `json:"flow"`
	PacketEncoding string `json:"packet_encoding"`
}

func (n *VLESS) Validate() error {
	if e := n.validateMultiplex(); e != nil {
		return e
	}
	return n.validateTransport()
}

func newVLESS() *VLESS {
	return &VLESS{
		Network: "tcp", MultiplexOptions: MultiplexOptions{MultiplexProtocol: "h2mux"},
		TransportOptions: TransportOptions{HTTPIdle: Duration(15 * time.Second), HTTPPing: Duration(15 * time.Second), GRPCIdle: Duration(15 * time.Second), GRPCPing: Duration(15 * time.Second)},
	}
}
