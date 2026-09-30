package singbox

import (
	"fmt"

	"hijpass/config/generator/coreconfig"
	"hijpass/config/generator/protocol"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
)

// Build consumes a validated protocol graph with resolved dependencies.
func Build(node protocol.Config) (*sb.Options, error) {
	base := node.Base()
	options := &sb.Options{
		Log: &sb.LogOptions{
			Level:     Fallback(base.LogLevel, "info"),
			Timestamp: true,
		},
		Inbounds: sbInbounds(*base),
		DNS: &sb.DNSOptions{
			RawDNSOptions: sb.RawDNSOptions{
				Servers: []sb.DNSServerOptions{
					{
						Type:    C.DNSTypeLocal,
						Tag:     coreconfig.LocalDNS,
						Options: &sb.LocalDNSServerOptions{},
					},
				},
			},
		},
		Route: &sb.RouteOptions{
			DefaultDomainResolver: &sb.DomainResolveOptions{Server: coreconfig.LocalDNS},
		},
	}
	switch n := node.(type) {
	case *protocol.LoadBalance:
		buildLoadBalance(options, n)
	case protocol.RemoteConfig:
		if err := buildRemote(options, n); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported remote proxy %T", node)
	}
	return options, nil
}
