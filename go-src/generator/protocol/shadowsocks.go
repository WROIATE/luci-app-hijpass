package protocol

import "hijpass/config/uci"

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
	d.Text("password", &n.Password)
	d.Text("network", &n.Network)
	d.Text("method", &n.Method)
	d.Text("plugin", &n.Plugin)
	d.Text("plugin_opts", &n.PluginOptions)
	d.Boolean("udp_over_tcp", &n.UDPOverTCP)
	return d.Err()
}
