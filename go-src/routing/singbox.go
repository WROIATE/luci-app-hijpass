package routing

import (
	"fmt"

	"hijpass/config/core/singbox"
	"hijpass/config/dns"
	"hijpass/config/proxy"

	sb "github.com/sagernet/sing-box/option"
)

func buildSingBox(b *builder, nodes *proxy.Catalog, s Settings, final, resolver string, dnsNodes dns.Catalog) error {
	endpoints, err := nodes.Endpoints()
	if err != nil {
		return err
	}
	cache := s.UseCache
	optionsDNS := &sb.DNSOptions{Final: resolver, Strategy: dns.SingBoxStrategy(s.Strategy), DisableCache: !cache, DisableExpire: !cache}
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
				Options: &sb.TProxyInboundOptions{ListenOptions: singbox.Listen(s.ListenPort, "::")},
			},
			{
				Type:    "direct",
				Tag:     "dns-in",
				Options: &sb.DirectInboundOptions{ListenOptions: singbox.Listen(s.DNSPort, "::")},
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
	b.config.SingBox = o
	for _, n := range endpoints {
		o.Outbounds = append(o.Outbounds, singbox.Socks(n.Name, n.Port))
	}
	d, e := dns.SingBoxServer(dnsNodes[resolver], resolver, final)
	if e != nil {
		return e
	}
	optionsDNS.Servers = append(optionsDNS.Servers, d)
	if name := s.RuleSetProxy; name != "" {
		if name == "hijpass-block" {
			return fmt.Errorf("rule-set download exit cannot be Block")
		}
		var out sb.Outbound
		if name == "hijpass-direct" {
			out = sb.Outbound{Type: "direct", Tag: "ruleset-out", Options: &sb.DirectOutboundOptions{}}
		} else {
			node, e := nodes.Port(name)
			if e != nil {
				return e
			}
			out = singbox.Socks("ruleset-out", node)
		}
		if r := s.RuleSetDNS; r != "" {
			dialer := out.Options.(sb.DialerOptionsWrapper)
			d := dialer.TakeDialerOptions()
			d.DomainResolver = &sb.DomainResolveOptions{Server: "ruleset-dns-resolver"}
			dialer.ReplaceDialerOptions(d)
			dnsServer, e := dns.SingBoxServer(dnsNodes[r], "ruleset-dns-resolver", "ruleset-out")
			if e != nil {
				return e
			}
			optionsDNS.Servers = append(optionsDNS.Servers, dnsServer)
		}
		o.Outbounds = append(o.Outbounds, out)
	}
	return nil
}
