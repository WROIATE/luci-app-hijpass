package singbox

import (
	"fmt"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
)

func DNSStrategy(s string) sb.DomainStrategy {
	switch s {
	case "4":
		return sb.DomainStrategy(C.DomainStrategyIPv4Only)
	case "6":
		return sb.DomainStrategy(C.DomainStrategyIPv6Only)
	case "46":
		return sb.DomainStrategy(C.DomainStrategyPreferIPv4)
	case "64":
		return sb.DomainStrategy(C.DomainStrategyPreferIPv6)
	default:
		return sb.DomainStrategy(C.DomainStrategyAsIS)
	}
}
func DNSServer(kind, address string, port uint16, tag, detour string) (sb.DNSServerOptions, error) {
	o := sb.DNSServerOptions{Tag: tag}
	o.Type = kind
	remote := sb.RemoteDNSServerOptions{DNSServerAddressOptions: sb.DNSServerAddressOptions{Server: address, ServerPort: port}}
	if detour != "direct-out" {
		remote.Detour = detour
	}
	switch o.Type {
	case "udp", "tcp":
		o.Options = &remote
	case "tls", "quic":
		o.Options = &sb.RemoteTLSDNSServerOptions{RemoteDNSServerOptions: remote}
	case "https":
		o.Options = &sb.RemoteHTTPSDNSServerOptions{RemoteTLSDNSServerOptions: sb.RemoteTLSDNSServerOptions{RemoteDNSServerOptions: remote}}
	case "local":
		o.Options = &sb.LocalDNSServerOptions{}
	default:
		return o, fmt.Errorf("invalid sing-box DNS type %q", o.Type)
	}
	return o, nil
}

func AddDNSRule(options *sb.Options, d sb.DNSServerOptions, match sb.RawDefaultDNSRule, strategy string) {
	tag := d.Tag
	dns := options.DNS
	dns.Servers = append(dns.Servers, d)
	dns.Rules = append(dns.Rules, sb.DNSRule{
		Type: "default",
		DefaultOptions: sb.DefaultDNSRule{
			RawDefaultDNSRule: match,
			DNSRuleAction: sb.DNSRuleAction{
				Action: "route",
				RouteOptions: sb.DNSRouteActionOptions{
					Server: tag,
					AbstractDNSRouteActionOptions: sb.AbstractDNSRouteActionOptions{
						Strategy:     DNSStrategy(strategy),
						DisableCache: true,
					},
				},
			},
		},
	})
}
