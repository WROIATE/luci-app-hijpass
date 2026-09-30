package protocol

import (
	"hijpass/config/uci"
	"hijpass/config/uci/constant"
)

// Shadowsocks contains only the options supported by this proxy type.
type Shadowsocks struct {
	BaseOptions
	ServerOptions
	MultiplexOptions
	Password      string
	Network       string
	Method        string
	Plugin        string
	PluginOptions string
	UDPOverTCP    bool
}

func (n *Shadowsocks) Validate() error { return n.validateMultiplex() }

func newShadowsocks() *Shadowsocks {
	return &Shadowsocks{MultiplexProtocol: "h2mux"}
}

func init() { register("shadowsocks", func() Config { return newShadowsocks() }) }

// DecodeUCI reads only options supported by Shadowsocks.
func (n *Shadowsocks) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	n.ServerOptions.decodeUCI(d)

	n.MultiplexOptions.decodeUCI(d)
	d.Text(constant.OptionPassword, &n.Password)
	d.Text(constant.OptionNetwork, &n.Network)
	d.Text(constant.OptionMethod, &n.Method)
	d.Text(constant.OptionPlugin, &n.Plugin)
	d.Text(constant.OptionPluginOptions, &n.PluginOptions)
	d.Boolean(constant.OptionUDPOverTCP, &n.UDPOverTCP)
	return d.Err()
}
