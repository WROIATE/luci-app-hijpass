package singbox

import (
	"hijpass/config/generator/coreconfig"
	"hijpass/config/generator/protocol"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
)

type RoutingOptions struct {
	ListenPort, DNSPort uint16
	LogLevel, Strategy  string
	UseCache            bool
	Final               string
	DefaultDNS          sb.DNSServerOptions
	RuleSetProxy        protocol.Config
	RuleSetDirect       bool
	RuleSetDNS          *sb.DNSServerOptions
}

// BuildRouting consumes resolved proxy objects and native DNS options.
func BuildRouting(s RoutingOptions, nodes []protocol.Config) *sb.Options {
	final, resolver := s.Final, s.DefaultDNS.Tag
	cache := s.UseCache
	optionsDNS := &sb.DNSOptions{Final: resolver, Strategy: DNSStrategy(s.Strategy), DisableCache: !cache, DisableExpire: !cache}
	route := &sb.RouteOptions{
		Final:                 final,
		DefaultDomainResolver: &sb.DomainResolveOptions{Server: resolver},
		Rules: []sb.Rule{
			{
				Type: C.RuleTypeDefault,
				DefaultOptions: sb.DefaultRule{
					Action: C.RuleActionTypeSniff,
				},
			},
			{
				Type: C.RuleTypeDefault,
				DefaultOptions: sb.DefaultRule{
					Protocol: []string{C.TypeDNS},
					Action:   C.RuleActionTypeHijackDNS,
				},
			},
		},
	}
	o := &sb.Options{
		Log: &sb.LogOptions{
			Level:     s.LogLevel,
			Timestamp: true,
		},
		DNS:   optionsDNS,
		Route: route,
		Inbounds: []sb.Inbound{
			{
				Type:    C.TypeTProxy,
				Tag:     coreconfig.TProxyInbound,
				Options: &sb.TProxyInboundOptions{ListenOptions: Listen(s.ListenPort, "::")},
			},
			{
				Type:    C.TypeDirect,
				Tag:     coreconfig.DNSInbound,
				Options: &sb.DirectInboundOptions{ListenOptions: Listen(s.DNSPort, "::")},
			},
		},
		Outbounds: []sb.Outbound{
			{
				Type:    C.TypeDirect,
				Tag:     coreconfig.DirectOutbound,
				Options: &sb.DirectOutboundOptions{},
			},
		},
	}

	for _, node := range nodes {
		base := node.Base()
		o.Outbounds = append(o.Outbounds, Socks(base.Name, base.SocksPort))
	}
	optionsDNS.Servers = append(optionsDNS.Servers, s.DefaultDNS)
	if s.RuleSetProxy != nil || s.RuleSetDirect {
		out := sb.Outbound{Type: C.TypeDirect, Tag: coreconfig.RuleSetOutbound, Options: &sb.DirectOutboundOptions{}}
		if s.RuleSetProxy != nil {
			out = Socks(coreconfig.RuleSetOutbound, s.RuleSetProxy.Base().SocksPort)
		}
		if s.RuleSetDNS != nil {
			dialer := out.Options.(sb.DialerOptionsWrapper)
			d := dialer.TakeDialerOptions()
			d.DomainResolver = &sb.DomainResolveOptions{Server: s.RuleSetDNS.Tag}
			dialer.ReplaceDialerOptions(d)
			optionsDNS.Servers = append(optionsDNS.Servers, *s.RuleSetDNS)
		}
		o.Outbounds = append(o.Outbounds, out)
	}

	return o
}

func AddRule(options *sb.Options, match sb.RawDefaultRule, out string, version int) {
	match.IPVersion = version
	action := sb.RuleAction{Action: C.RuleActionTypeRoute, RouteOptions: sb.RouteActionOptions{Outbound: out}}
	if out == coreconfig.BlockOutbound {
		action = sb.RuleAction{Action: C.RuleActionTypeReject}
	}
	options.Route.Rules = append(options.Route.Rules, sb.Rule{Type: C.RuleTypeDefault, DefaultOptions: sb.DefaultRule{RawDefaultRule: match, RuleAction: action}})
}
