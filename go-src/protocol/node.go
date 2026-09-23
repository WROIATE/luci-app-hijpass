// Package protocol defines input-independent proxy models, defaults and validation.
package protocol

import "fmt"

// Node exposes common metadata and protocol-specific validation.
type Node interface {
	Base() *BaseOptions
	Validate() error
}

// RemoteNode has a server and optional upstream. LoadBalance is not remote.
type RemoteNode interface {
	Node
	Endpoint() *ServerOptions
}

func (n *BaseOptions) Base() *BaseOptions         { return n }
func (n *ServerOptions) Endpoint() *ServerOptions { return n }

// New creates a protocol node with its defaults. Call protocol.Validate after filling its fields.
func New(kind string) (Node, error) {
	var n Node
	switch kind {
	case "shadowsocks":
		n = newShadowsocks()
	case "hysteria2":
		n = &Hysteria2{}
	case "tuic":
		n = newTUIC()
	case "shadowtls":
		n = newShadowTLS()
	case "vless":
		n = newVLESS()
	case "load_balance":
		n = newLoadBalance()
	default:
		return nil, fmt.Errorf("unsupported proxy type %q", kind)
	}
	n.Base().Type = kind
	n.Base().LogLevel = "info"
	return n, nil
}

// Validate checks common options and the concrete protocol's constraints.
func Validate(n Node) error {
	if err := n.Base().validateBase(); err != nil {
		return err
	}
	if remote, ok := n.(RemoteNode); ok {
		if err := remote.Endpoint().validateServer(); err != nil {
			return err
		}
	}
	if err := n.Validate(); err != nil {
		return err
	}
	return nil
}
