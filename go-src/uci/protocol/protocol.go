// Package protocol defines UCI proxy models, field conversion, defaults and validation.
package protocol

import (
	"fmt"

	"hijpass/config/uci"
)

const (
	CoreSingBox       = "sing-box"
	CoreSingBoxLegacy = "singbox"
	CoreXray          = "xray"
	CoreCustom        = "custom"
)

// Config exposes common metadata, UCI conversion and protocol-specific validation.
type Config interface {
	Base() *BaseOptions
	DecodeUCI(*uci.Decoder) error
	Validate() error
}

// RemoteConfig has a server and optional upstream. LoadBalance is not remote.
type RemoteConfig interface {
	Config
	Endpoint() *ServerOptions
}

func (n *BaseOptions) Base() *BaseOptions         { return n }
func (n *ServerOptions) Endpoint() *ServerOptions { return n }

// New creates a protocol configuration with its defaults. Call protocol.Validate after filling its fields.
func New(kind string) (Config, error) {
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
func Validate(n Config) error {
	if err := n.Base().validateBase(); err != nil {
		return err
	}
	if remote, ok := n.(RemoteConfig); ok {
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
var factories = map[string]func() Config{}

func register(kind string, factory func() Config) {
	if kind == "" || factory == nil {
		panic("invalid protocol registration")
	}
	if _, exists := factories[kind]; exists {
		panic("duplicate protocol registration: " + kind)
	}
	factories[kind] = factory
}

// Decode selects a registered protocol and delegates field conversion to it.
func Decode(data []byte) (Config, error) {
	d, err := uci.NewDecoder(data)
	if err != nil {
		return nil, err
	}
	var kind string
	d.Text(uci.OptionType, &kind)
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
