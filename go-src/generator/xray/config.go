package xray

import (
	"cmp"
	"fmt"

	"hijpass/config/generator/constant"
	uciprotocol "hijpass/config/uci/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

// Build consumes a validated protocol graph with resolved dependencies.
func Build(node uciprotocol.Config) (*xr.Config, error) {
	base := node.Base()
	x := &xr.Config{LogConfig: Log(base.LogLevel)}
	for _, p := range []struct {
		typ, tag string
		port     uint16
	}{{inboundTProxy, constant.TProxyInbound, base.ListenPort}, {inboundSocks, constant.SocksInbound, base.SocksPort}} {
		in, e := Inbound(p.typ, p.tag, p.port, false)
		if e != nil {
			return nil, e
		}
		x.InboundConfigs = append(x.InboundConfigs, in)
	}
	switch n := node.(type) {
	case *uciprotocol.LoadBalance:
		if err := buildLoadBalance(x, n); err != nil {
			return nil, err
		}
	case uciprotocol.RemoteConfig:
		if err := buildRemote(x, n); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported remote proxy %T", node)
	}
	return x, nil
}

func Log(level string) *xr.LogConfig {
	if level == "warn" {
		level = "warning"
	}
	return &xr.LogConfig{LogLevel: cmp.Or(level, "info")}
}
