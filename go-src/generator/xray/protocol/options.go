package protocol

import (
	"encoding/json"

	xn "github.com/xtls/xray-core/common/net"
	xr "github.com/xtls/xray-core/infra/conf"
)

// Address converts a host to Xray's native address type.
func Address(host string) *xr.Address { return &xr.Address{Address: xn.ParseAddress(host)} }

// RawSettings encodes native protocol settings for Xray configuration fields.
func RawSettings(v any) (*json.RawMessage, error) {
	b, e := json.Marshal(v)
	if e != nil {
		return nil, e
	}
	r := json.RawMessage(b)
	return &r, nil
}
