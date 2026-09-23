package protocol

// Shadowsocks contains only the options supported by this proxy type.
type Shadowsocks struct {
	BaseOptions
	ServerOptions
	MultiplexOptions
	Password      string `json:"password"`
	Network       string `json:"network"`
	Method        string `json:"method"`
	Plugin        string `json:"plugin"`
	PluginOptions string `json:"plugin_opts"`
	UDPOverTCP    Bool   `json:"udp_over_tcp"`
}

func (n *Shadowsocks) Validate() error { return n.validateMultiplex() }

func newShadowsocks() *Shadowsocks {
	return &Shadowsocks{MultiplexOptions: MultiplexOptions{MultiplexProtocol: "h2mux"}}
}
