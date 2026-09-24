package dns

import (
	"fmt"

	"hijpass/config/core"
	"hijpass/config/routing/match"

	sb "github.com/sagernet/sing-box/option"
)

type Plan struct {
	config    *core.Config
	servers   Catalog
	resolver  string
	dnsExits  map[string][]string
	exitOrder []string
}

func NewPlan(config *core.Config, servers Catalog, resolver string) *Plan {
	return &Plan{config: config, servers: servers, resolver: resolver, dnsExits: map[string][]string{}}
}
func (b *Plan) Add(policy Policy, name, out string, r match.Rule) error {
	if out == "block" {
		return fmt.Errorf("rule %q DNS exit cannot be Block", name)
	}
	tag := name + "-dns"
	node := b.servers[core.Fallback(policy.Server, b.resolver)]
	if b.config.SingBox != nil {
		d, e := SingBoxServer(node, tag, out)
		if e != nil {
			return e
		}
		dns := b.config.SingBox.DNS
		dns.Servers = append(dns.Servers, d)
		dns.Rules = append(dns.Rules, sb.DNSRule{
			Type: "default",
			DefaultOptions: sb.DefaultDNSRule{
				RawDefaultDNSRule: r.SingBoxDNS(),
				DNSRuleAction: sb.DNSRuleAction{
					Action: "route",
					RouteOptions: sb.DNSRouteActionOptions{
						Server: tag,
						AbstractDNSRouteActionOptions: sb.AbstractDNSRouteActionOptions{
							Strategy:     SingBoxStrategy(policy.Strategy),
							DisableCache: true,
						},
					},
				},
			},
		})
	} else {
		d, e := XrayServer(node, tag)
		if e != nil {
			return e
		}
		d.Domains = r.XrayDomains()
		d.QueryStrategy = Strategy("xray", policy.Strategy)
		b.config.Xray.DNSConfig.Servers = append(b.config.Xray.DNSConfig.Servers, d)
		if _, ok := b.dnsExits[out]; !ok {
			b.exitOrder = append(b.exitOrder, out)
		}
		b.dnsExits[out] = append(b.dnsExits[out], tag)
	}
	return nil
}

func (b *Plan) Finish() ([]core.XrayRouteRule, error) {
	if b.config.Xray == nil {
		return nil, nil
	}
	d, err := XrayServer(b.servers[b.resolver], "default-dns")
	if err != nil {
		return nil, err
	}
	d.SkipFallback = false
	b.config.Xray.DNSConfig.Servers = append(b.config.Xray.DNSConfig.Servers, d)
	routes := []core.XrayRouteRule{{InboundTag: []string{"dns-in"}, OutboundTag: "dns-out"}}
	for _, out := range b.exitOrder {
		routes = append(routes, core.XrayRouteRule{InboundTag: b.dnsExits[out], OutboundTag: out})
	}
	return routes, nil
}
