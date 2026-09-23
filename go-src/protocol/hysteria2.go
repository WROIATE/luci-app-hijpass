package protocol

import (
	"fmt"
	"hijpass/config/uci"
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

func init() { register("hysteria2", func() Node { return &Hysteria2{} }) }

// DecodeUCI reads only options supported by Hysteria2.
func (n *Hysteria2) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	n.ServerOptions.decodeUCI(d)

	n.TLSOptions.decodeUCI(d)
	d.Text("password", &n.Password)
	d.Text("network", &n.Network)
	d.OptionalInteger("up_mbps", &n.UpMbps)
	d.OptionalInteger("down_mbps", &n.DownMbps)
	d.Integer("udp_idle_timeout", &n.UDPIdleTimeout)
	d.List("server_ports", &n.ServerPorts)
	d.Duration("hop_interval", &n.HopInterval)
	d.Text("obfs_type", &n.ObfsType)
	d.Text("obfs_password", &n.ObfsPassword)
	return d.Err()
}
