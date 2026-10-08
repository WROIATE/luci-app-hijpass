package generator

import (
	"context"
	"encoding/json"

	sb "github.com/sagernet/sing-box/option"
	sj "github.com/sagernet/sing/common/json"
	xr "github.com/xtls/xray-core/infra/conf"
)

// CoreConfig is a generated core configuration with its native JSON serializer.
type CoreConfig interface {
	Serialize() ([]byte, error)
}

// XrayConfig retains the native Xray schema.
type XrayConfig xr.Config

// SingBoxConfig retains the native sing-box schema.
type SingBoxConfig sb.Options

func (c *XrayConfig) Serialize() ([]byte, error) {
	return json.Marshal((*xr.Config)(c))
}
func (c *SingBoxConfig) Serialize() ([]byte, error) {
	return sj.MarshalContext(context.Background(), (*sb.Options)(c))
}
