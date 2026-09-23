// Package protocol defines protocol-specific proxy nodes and decodes their flat
// UCI representation. Core configuration generation belongs to the caller.
package protocol

import (
	"encoding/json"
	"fmt"
)

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

// Decode selects a concrete node and validates only its applicable fields.
// Defaults are applied before decoding so explicit UCI values take precedence.
func Decode(kind string, data []byte) (Node, error) {
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
	n.Base().LogLevel = "info"
	if err := json.Unmarshal(data, n); err != nil {
		return nil, err
	}
	if n.Base().Type != kind {
		return nil, fmt.Errorf("proxy type does not match %q", kind)
	}
	if err := n.Base().validateBase(); err != nil {
		return nil, err
	}
	if remote, ok := n.(RemoteNode); ok {
		if err := remote.Endpoint().validateServer(); err != nil {
			return nil, err
		}
	}
	if err := n.Validate(); err != nil {
		return nil, err
	}
	return n, nil
}
