package protocol

import "hijpass/config/uci"

// ShadowTLS contains only the options supported by this proxy type.
type ShadowTLS struct {
	BaseOptions
	ServerOptions
	TLSOptions
	Password         string
	ShadowTLSVersion int64
}

func (n *ShadowTLS) Validate() error { return validateInt32(n.ShadowTLSVersion) }

func newShadowTLS() *ShadowTLS { return &ShadowTLS{ShadowTLSVersion: 1} }

func init() { register("shadowtls", func() Config { return newShadowTLS() }) }

// DecodeUCI reads only options supported by ShadowTLS.
func (n *ShadowTLS) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	n.ServerOptions.decodeUCI(d)

	n.TLSOptions.decodeUCI(d)
	d.Text("password", &n.Password)
	d.Integer("version", &n.ShadowTLSVersion)
	return d.Err()
}
