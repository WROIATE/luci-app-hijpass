package xray

import (
	"fmt"

	"hijpass/config/generator/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

// Build consumes a validated protocol graph with resolved dependencies.
func Build(node protocol.Config) (*xr.Config, error) {
	base := node.Base()
	x := &xr.Config{LogConfig: Log(base.LogLevel)}
	for _, p := range []struct {
		typ, tag string
		port     uint16
	}{{"tproxy", "tproxy-in", base.ListenPort}, {"socks", "socks-in", base.SocksPort}} {
		in, e := Inbound(p.typ, p.tag, p.port, false)
		if e != nil {
			return nil, e
		}
		x.InboundConfigs = append(x.InboundConfigs, in)
	}
	switch n := node.(type) {
	case *protocol.LoadBalance:
		if err := buildLoadBalance(x, n); err != nil {
			return nil, err
		}
	case protocol.RemoteConfig:
		if err := buildRemote(x, n); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported remote proxy %T", node)
	}
	return x, nil
}
