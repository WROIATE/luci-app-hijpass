package singbox

import (
	"fmt"

	"hijpass/config/generator/protocol"

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
						Type:    "local",
						Tag:     "local",
						Options: &sb.LocalDNSServerOptions{},
					},
				},
			},
		},
		Route: &sb.RouteOptions{
			DefaultDomainResolver: &sb.DomainResolveOptions{Server: "local"},
		},
	}
	if n, ok := node.(*protocol.LoadBalance); ok {
		buildLoadBalance(options, n)
	} else {
		remote, ok := node.(protocol.RemoteConfig)
		if !ok {
			return nil, fmt.Errorf("unsupported remote proxy %T", node)
		}
		out, e := sbProtocol(remote)
		endpoint := remote.Endpoint()
		if e != nil {
			return nil, e
		}
		options.Outbounds = append(options.Outbounds, out)
		if endpoint.Upstream != nil {
			port := uint16(endpoint.Upstream.Base().SocksPort)
			tag := "upstream-" + endpoint.Upstream.Base().Name
			dialer := out.Options.(sb.DialerOptionsWrapper)
			d := dialer.TakeDialerOptions()
			d.Detour = tag
			dialer.ReplaceDialerOptions(d)
			options.Outbounds = append(options.Outbounds, Socks(tag, port))
		}
	}
	return options, nil
}
