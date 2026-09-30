package singbox

import (
	"cmp"
	"fmt"

	"hijpass/config/generator/constant"
	uciprotocol "hijpass/config/uci/protocol"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
)

// Build consumes a validated protocol graph with resolved dependencies.
func Build(node uciprotocol.Config) (*sb.Options, error) {
	base := node.Base()
	options := &sb.Options{
		Log: &sb.LogOptions{
			Level:     cmp.Or(base.LogLevel, "info"),
			Timestamp: true,
		},
		Inbounds: sbInbounds(*base),
		DNS: &sb.DNSOptions{
			RawDNSOptions: sb.RawDNSOptions{
				Servers: []sb.DNSServerOptions{
					{
						Type:    C.DNSTypeLocal,
						Tag:     constant.LocalDNS,
						Options: &sb.LocalDNSServerOptions{},
					},
				},
			},
		},
		Route: &sb.RouteOptions{
			DefaultDomainResolver: &sb.DomainResolveOptions{Server: constant.LocalDNS},
		},
	}
	switch n := node.(type) {
	case *uciprotocol.LoadBalance:
		buildLoadBalance(options, n)
	case uciprotocol.RemoteConfig:
		if err := buildRemote(options, n); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported remote proxy %T", node)
	}
	return options, nil
}
