package protocol

// ShadowTLS contains only the options supported by this proxy type.
type ShadowTLS struct {
	BaseOptions
	ServerOptions
	TLSOptions
	Password         string `json:"password"`
	ShadowTLSVersion Int    `json:"version"`
}

func (n *ShadowTLS) Validate() error { return validateInt32(n.ShadowTLSVersion) }

func newShadowTLS() *ShadowTLS { return &ShadowTLS{ShadowTLSVersion: 1} }
