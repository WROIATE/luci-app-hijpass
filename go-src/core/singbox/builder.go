package singbox

import (
	"fmt"

	"hijpass/config/core"
	"hijpass/config/protocol"

	sb "github.com/sagernet/sing-box/option"
)

func Build(node protocol.Config, resolvePort func(string) (uint16, error)) (*core.Config, error) {
	base := node.Base()
	options := &sb.Options{
		Log: &sb.LogOptions{
			Level:     core.Fallback(base.LogLevel, "info"),
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
		if err := buildLoadBalance(options, n, resolvePort); err != nil {
			return nil, err
		}
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
		if endpoint.Upstream != "" {
			port, e := resolvePort(endpoint.Upstream)
			if e != nil {
				return nil, e
			}
			tag := "upstream-" + endpoint.Upstream
			dialer := out.Options.(sb.DialerOptionsWrapper)
			d := dialer.TakeDialerOptions()
			d.Detour = tag
			dialer.ReplaceDialerOptions(d)
			options.Outbounds = append(options.Outbounds, Socks(tag, port))
		}
	}
	return &core.Config{SingBox: options}, nil
}
