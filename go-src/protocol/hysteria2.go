package protocol

import (
	"fmt"
	"math"
	"time"
)

// Hysteria2 contains only the options supported by this proxy type.
type Hysteria2 struct {
	BaseOptions
	ServerOptions
	TLSOptions
	Password       string
	Network        string
	UpMbps         *int64
	DownMbps       *int64
	UDPIdleTimeout int64
	ServerPorts    []string
	HopInterval    time.Duration
	ObfsType       string
	ObfsPassword   string
}

func (n *Hysteria2) Validate() error {
	for _, v := range []*int64{n.UpMbps, n.DownMbps} {
		if v != nil && *v > math.MaxInt32 {
			return fmt.Errorf("bandwidth exceeds 32-bit range")
		}
	}
	return nil
}
