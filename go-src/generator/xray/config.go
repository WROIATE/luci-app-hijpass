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
		port     int64
	}{{"tproxy", "tproxy-in", base.ListenPort}, {"socks", "socks-in", base.SocksPort}} {
		in, e := Inbound(p.typ, p.tag, uint16(p.port), false)
		if e != nil {
			return nil, e
		}
		x.InboundConfigs = append(x.InboundConfigs, in)
	}
	if n, ok := node.(*protocol.LoadBalance); ok {
		if err := buildLoadBalance(x, n); err != nil {
			return nil, err
		}
	} else {
		remote, ok := node.(protocol.RemoteConfig)
		if !ok {
			return nil, fmt.Errorf("unsupported remote proxy %T", node)
		}
		out, e := xrProtocol(remote)
		endpoint := remote.Endpoint()
		if e != nil {
			return nil, e
		}
		if endpoint.Upstream != nil {
			port := uint16(endpoint.Upstream.Base().SocksPort)
			tag := "upstream-" + endpoint.Upstream.Base().Name
			if out.StreamSetting == nil {
				out.StreamSetting = &xr.StreamConfig{}
			}
			out.StreamSetting.SocketSettings = &xr.SocketConfig{DialerProxy: tag, DomainStrategy: "UseIP"}
			socks, e := Socks(tag, port)
			if e != nil {
				return nil, e
			}
			x.OutboundConfigs = []xr.OutboundDetourConfig{out, socks}
		} else {
			x.OutboundConfigs = []xr.OutboundDetourConfig{out}
		}
	}
	return x, nil
}
