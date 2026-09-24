package generator

import (
	"context"
	"encoding/json"

	sb "github.com/sagernet/sing-box/option"
	sj "github.com/sagernet/sing/common/json"
	xr "github.com/xtls/xray-core/infra/conf"
)

// Each output keeps its native schema and supplies the appropriate serializer.
type XrayConfig xr.Config
type SingBoxConfig sb.Options

func (c *XrayConfig) MarshalJSON() ([]byte, error) {
	return json.Marshal((*xr.Config)(c))
}
func (c *SingBoxConfig) MarshalJSON() ([]byte, error) {
	return sj.MarshalContext(context.Background(), (*sb.Options)(c))
}
