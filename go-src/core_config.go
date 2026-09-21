package main

import (
	"context"
	"encoding/json"
	"errors"
	xr "github.com/xtls/xray-core/infra/conf"

	sb "github.com/sagernet/sing-box/option"
	sj "github.com/sagernet/sing/common/json"
)

// Exactly one native configuration is set. Maps are used only for keyed lookups,
// never to model a core's configuration schema.
type coreConfig struct {
	Xray    *xr.Config
	SingBox *sb.Options
}

func (c *coreConfig) MarshalJSON() ([]byte, error) {
	if c == nil {
		return []byte("null"), nil
	}
	if c.Xray != nil && c.SingBox == nil {
		return json.Marshal(c.Xray)
	}
	if c.SingBox != nil && c.Xray == nil {
		return sj.MarshalContext(context.Background(), c.SingBox)
	}
	return nil, errors.New("configuration must have exactly one core")
}
func encode(c *coreConfig) ([]byte, error) { return json.MarshalIndent(c, "", "  ") }
func rawSettings(v any) (*json.RawMessage, error) {
	b, e := json.Marshal(v)
	if e != nil {
		return nil, e
	}
	r := json.RawMessage(b)
	return &r, nil
}
func ptr[T any](v T) *T { return &v }

// Server address replacement happens after SNI has been computed. Native typed
// settings prevent a runtime map assertion or accidental mutation of TLS fields.
func (c *coreConfig) replaceServer(address string) error {
	if c.SingBox != nil {
		if len(c.SingBox.Outbounds) == 0 {
			return errors.New("missing outbound")
		}
		wrapper, ok := c.SingBox.Outbounds[0].Options.(sb.ServerOptionsWrapper)
		if !ok {
			return errors.New("outbound has no server options")
		}
		server := wrapper.TakeServerOptions()
		server.Server = address
		wrapper.ReplaceServerOptions(server)
		return nil
	}
	if c.Xray == nil || len(c.Xray.OutboundConfigs) == 0 {
		return errors.New("missing outbound")
	}
	out := &c.Xray.OutboundConfigs[0]
	if out.Settings == nil {
		return errors.New("missing outbound settings")
	}
	var err error
	switch out.Protocol {
	case "shadowsocks":
		var s xr.ShadowsocksClientConfig
		err = json.Unmarshal(*out.Settings, &s)
		if err == nil {
			s.Address = xrAddress(address)
			out.Settings, err = rawSettings(s)
		}
	case "vless":
		var s xr.VLessOutboundConfig
		err = json.Unmarshal(*out.Settings, &s)
		if err == nil {
			s.Address = xrAddress(address)
			out.Settings, err = rawSettings(s)
		}
	case "hysteria":
		var s xr.HysteriaClientConfig
		err = json.Unmarshal(*out.Settings, &s)
		if err == nil {
			s.Address = xrAddress(address)
			out.Settings, err = rawSettings(s)
		}
	default:
		err = errors.New("outbound has no supported server settings")
	}
	return err
}
