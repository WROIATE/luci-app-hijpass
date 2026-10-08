package protocol

import (
	"fmt"
	"math"
	"time"

	"hijpass/config/uci"
	"hijpass/config/uci/constant"
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

func init() { register(constant.TypeHysteria2, func() Config { return &Hysteria2{} }) }

// DecodeUCI reads only options supported by Hysteria2.
func (n *Hysteria2) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	n.ServerOptions.decodeUCI(d)

	n.TLSOptions.decodeUCI(d)
	d.Text(constant.OptionPassword, &n.Password)
	d.Text(constant.OptionNetwork, &n.Network)
	d.OptionalInteger(constant.OptionUpMbps, &n.UpMbps)
	d.OptionalInteger(constant.OptionDownMbps, &n.DownMbps)
	d.Integer(constant.OptionUDPIdleTimeout, &n.UDPIdleTimeout)
	d.List(constant.OptionServerPorts, &n.ServerPorts)
	d.Duration(constant.OptionHopInterval, &n.HopInterval)
	d.Text(constant.OptionObfsType, &n.ObfsType)
	d.Text(constant.OptionObfsPassword, &n.ObfsPassword)
	return d.Err()
}
