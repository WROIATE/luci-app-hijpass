package generator

import (
	"context"
	"encoding/json"
	"errors"

	sb "github.com/sagernet/sing-box/option"
	sj "github.com/sagernet/sing/common/json"
	xr "github.com/xtls/xray-core/infra/conf"
)

// Exactly one native configuration is set. Maps are used only for keyed lookups,
// never to model a core's configuration schema.
type Output struct {
	Xray    *xr.Config
	SingBox *sb.Options
}

func (c *Output) MarshalJSON() ([]byte, error) {
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
