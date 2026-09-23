// Package protocol defines proxy models, UCI conversion, defaults and validation.
package protocol

import (
	"fmt"
	"hijpass/config/uci"
)

// Node exposes common metadata, UCI conversion and protocol-specific validation.
type Node interface {
	Base() *BaseOptions
	DecodeUCI(*uci.Decoder) error
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
	factory, ok := factories[kind]
	if !ok {
		return nil, fmt.Errorf("unsupported proxy type %q", kind)
	}
	n := factory()
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

// Each protocol registers its constructor in its own file during initialization.
// The registry is read-only after package initialization.
var factories = map[string]func() Node{}

func register(kind string, factory func() Node) {
	if kind == "" || factory == nil {
		panic("invalid protocol registration")
	}
	if _, exists := factories[kind]; exists {
		panic("duplicate protocol registration: " + kind)
	}
	factories[kind] = factory
}

// Decode selects a registered protocol and delegates field conversion to it.
func Decode(data []byte) (Node, error) {
	d, err := uci.NewDecoder(data)
	if err != nil {
		return nil, err
	}
	var kind string
	d.Text("type", &kind)
	if err := d.Err(); err != nil {
		return nil, err
	}
	n, err := New(kind)
	if err != nil {
		return nil, err
	}
	if err := n.DecodeUCI(d); err != nil {
		return nil, err
	}
	if err := Validate(n); err != nil {
		return nil, err
	}
	return n, nil
}
