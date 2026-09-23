package protocol

import (
	"fmt"
	"math"
)

// Hysteria2 contains only the options supported by this proxy type.
type Hysteria2 struct {
	BaseOptions
	ServerOptions
	TLSOptions
	Password       string     `json:"password"`
	Network        string     `json:"network"`
	UpMbps         *Int       `json:"up_mbps"`
	DownMbps       *Int       `json:"down_mbps"`
	UDPIdleTimeout Int        `json:"udp_idle_timeout"`
	ServerPorts    StringList `json:"server_ports"`
	HopInterval    Duration   `json:"hop_interval"`
	ObfsType       string     `json:"obfs_type"`
	ObfsPassword   string     `json:"obfs_password"`
}

func (n *Hysteria2) Validate() error {
	for _, v := range []*Int{n.UpMbps, n.DownMbps} {
		if v != nil && *v > math.MaxInt32 {
			return fmt.Errorf("bandwidth exceeds 32-bit range")
		}
	}
	return nil
}
