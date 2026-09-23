package protocol

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
	return &Shadowsocks{MultiplexOptions: MultiplexOptions{MultiplexProtocol: "h2mux"}}
}
