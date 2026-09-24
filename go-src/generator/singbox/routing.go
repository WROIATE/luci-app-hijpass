package singbox

import (
	"fmt"

	sb "github.com/sagernet/sing-box/option"
)

type RoutingOptions struct {
	ListenPort, DNSPort                       uint16
	LogLevel, Strategy                        string
	UseCache                                  bool
	Final, Resolver, RuleSetProxy, RuleSetDNS string
}

func BuildRouting(s RoutingOptions, names []string, resolvePort func(string) (uint16, error), resolveDNS func(string, string, string) (sb.DNSServerOptions, error)) (*sb.Options, error) {
	final, resolver := s.Final, s.Resolver
	cache := s.UseCache
	optionsDNS := &sb.DNSOptions{Final: resolver, Strategy: DNSStrategy(s.Strategy), DisableCache: !cache, DisableExpire: !cache}
	route := &sb.RouteOptions{
		Final:                 final,
		DefaultDomainResolver: &sb.DomainResolveOptions{Server: resolver},
		Rules: []sb.Rule{
			{
				Type: "default",
				DefaultOptions: sb.DefaultRule{
					RuleAction: sb.RuleAction{Action: "sniff"},
				},
			},
			{
				Type: "default",
				DefaultOptions: sb.DefaultRule{
					RawDefaultRule: sb.RawDefaultRule{
						Protocol: []string{"dns"},
					},
					RuleAction: sb.RuleAction{Action: "hijack-dns"},
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
				Type:    "tproxy",
				Tag:     "tproxy-in",
				Options: &sb.TProxyInboundOptions{ListenOptions: Listen(s.ListenPort, "::")},
			},
			{
				Type:    "direct",
				Tag:     "dns-in",
				Options: &sb.DirectInboundOptions{ListenOptions: Listen(s.DNSPort, "::")},
			},
		},
		Outbounds: []sb.Outbound{
			{
				Type:    "direct",
				Tag:     "direct-out",
				Options: &sb.DirectOutboundOptions{},
			},
		},
	}

	for _, name := range names {
		port, err := resolvePort(name)
		if err != nil {
			return nil, err
		}
		o.Outbounds = append(o.Outbounds, Socks(name, port))
	}
	d, e := resolveDNS(resolver, resolver, final)
	if e != nil {
		return nil, e
	}
	optionsDNS.Servers = append(optionsDNS.Servers, d)
	if name := s.RuleSetProxy; name != "" {
		if name == "hijpass-block" {
			return nil, fmt.Errorf("rule-set download exit cannot be Block")
		}
		var out sb.Outbound
		if name == "hijpass-direct" {
			out = sb.Outbound{Type: "direct", Tag: "ruleset-out", Options: &sb.DirectOutboundOptions{}}
		} else {
			node, e := resolvePort(name)
			if e != nil {
				return nil, e
			}
			out = Socks("ruleset-out", node)
		}
		if r := s.RuleSetDNS; r != "" {
			dialer := out.Options.(sb.DialerOptionsWrapper)
			d := dialer.TakeDialerOptions()
			d.DomainResolver = &sb.DomainResolveOptions{Server: "ruleset-dns-resolver"}
			dialer.ReplaceDialerOptions(d)
			dnsServer, e := resolveDNS(r, "ruleset-dns-resolver", "ruleset-out")
			if e != nil {
				return nil, e
			}
			optionsDNS.Servers = append(optionsDNS.Servers, dnsServer)
		}
		o.Outbounds = append(o.Outbounds, out)
	}
	return o, nil
}

func AddRule(options *sb.Options, match sb.RawDefaultRule, out string, version int) {
	match.IPVersion = version
	action := sb.RuleAction{Action: "route", RouteOptions: sb.RouteActionOptions{Outbound: out}}
	if out == "block" {
		action = sb.RuleAction{Action: "reject"}
	}
	options.Route.Rules = append(options.Route.Rules, sb.Rule{Type: "default", DefaultOptions: sb.DefaultRule{RawDefaultRule: match, RuleAction: action}})
}
