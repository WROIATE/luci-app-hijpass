package feature

import (
	"encoding/json"
	"fmt"
	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
	xr "github.com/xtls/xray-core/infra/conf"
	"hijpass/config/core"
	"hijpass/config/core/singbox"
	"hijpass/config/core/xray"
	"hijpass/config/uci"
	"net"
	"strconv"
)

type shuntBuilder struct {
	config    *core.Config
	settings  uci.Section
	dnsNodes  map[string]uci.Section
	resolver  string
	xrRoutes  []core.XrayRouteRule
	dnsExits  map[string][]string
	exitOrder []string
	setIndex  map[string]int
}

func sbStrategy(s string) sb.DomainStrategy {
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
func sbDNSServer(s uci.Section, tag, detour string) (sb.DNSServerOptions, error) {
	o := sb.DNSServerOptions{Type: s.String("type"), Tag: tag}
	if s == nil {
		return o, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	if s.String("port") != "" {
		if e := port(s, "port"); e != nil {
			return o, e
		}
	}
	remote := sb.RemoteDNSServerOptions{DNSServerAddressOptions: sb.DNSServerAddressOptions{Server: s.String("server"), ServerPort: uint16(s.Number("port"))}}
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
func xrDNSServer(s uci.Section, tag string) (*xr.NameServerConfig, error) {
	if s == nil {
		return nil, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	if s.String("port") != "" {
		if e := port(s, "port"); e != nil {
			return nil, e
		}
	}
	addr := s.String("server")
	o := &xr.NameServerConfig{Tag: tag, SkipFallback: true}
	switch s.String("type") {
	case "tcp", "quic":
		addr = s.String("type") + "://" + addr
		o.Port = uint16(s.Number("port"))
	case "https":
		if s.String("port") != "" {
			addr = net.JoinHostPort(addr, s.String("port"))
		} else if net.ParseIP(addr) != nil && net.ParseIP(addr).To4() == nil {
			addr = "[" + addr + "]"
		}
		addr = "https://" + addr + "/dns-query"
	case "udp":
		o.Port = uint16(s.Number("port"))
	default:
		return nil, fmt.Errorf("invalid Xray DNS type %q", s.String("type"))
	}
	o.Address = xray.Address(addr)
	return o, nil
}
func newShunt(c Config, s uci.Section, co, final, resolver string, dnsNodes map[string]uci.Section) (*shuntBuilder, error) {
	b := &shuntBuilder{config: &core.Config{}, settings: s, resolver: resolver, dnsNodes: dnsNodes, dnsExits: map[string][]string{}, setIndex: map[string]int{}}
	cache := s.String("use_cache") == "1"
	if co == "sing-box" {
		dns := &sb.DNSOptions{RawDNSOptions: sb.RawDNSOptions{Final: resolver, DNSClientOptions: sb.DNSClientOptions{Strategy: sbStrategy(s.Value("default_strategy", "64")), DisableCache: !cache, DisableExpire: !cache}}}
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
				Level:     s.Value("log_level", "info"),
				Timestamp: true,
			},
			DNS:   dns,
			Route: route,
			Inbounds: []sb.Inbound{
				{
					Type:    "tproxy",
					Tag:     "tproxy-in",
					Options: &sb.TProxyInboundOptions{ListenOptions: singbox.Listen(uint16(s.Number("shunt_listen_port")), "::")},
				},
				{
					Type:    "direct",
					Tag:     "dns-in",
					Options: &sb.DirectInboundOptions{ListenOptions: singbox.Listen(uint16(s.Number("dns_listen_port")), "::")},
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
		for _, n := range c.Of("proxy_node") {
			if n.String("enabled") == "1" {
				o.Outbounds = append(o.Outbounds, singbox.Socks(n.String("name"), uint16(n.Number("socks_port"))))
			}
		}
		d, e := sbDNSServer(dnsNodes[resolver], resolver, final)
		if e != nil {
			return nil, e
		}
		dns.Servers = append(dns.Servers, d)
		if name := s.String("ruleset_out_node"); name != "" {
			if name == "hijpass-block" {
				return nil, fmt.Errorf("rule-set download exit cannot be Block")
			}
			var out sb.Outbound
			if name == "hijpass-direct" {
				out = sb.Outbound{Type: "direct", Tag: "ruleset-out", Options: &sb.DirectOutboundOptions{}}
			} else {
				node, e := c.node(name)
				if e != nil {
					return nil, e
				}
				out = singbox.Socks("ruleset-out", uint16(node.Number("socks_port")))
			}
			if r := s.String("ruleset_dns_node"); r != "" {
				dialer := out.Options.(sb.DialerOptionsWrapper)
				d := dialer.TakeDialerOptions()
				d.DomainResolver = &sb.DomainResolveOptions{Server: "ruleset-dns-resolver"}
				dialer.ReplaceDialerOptions(d)
				dnsServer, e := sbDNSServer(dnsNodes[r], "ruleset-dns-resolver", "ruleset-out")
				if e != nil {
					return nil, e
				}
				dns.Servers = append(dns.Servers, dnsServer)
			}
			o.Outbounds = append(o.Outbounds, out)
		}
	} else {
		x := &xr.Config{
			LogConfig:    xray.Log(s.String("log_level")),
			RouterConfig: &xr.RouterConfig{DomainStrategy: core.Ptr("AsIs")},
			DNSConfig: &xr.DNSConfig{
				QueryStrategy: core.Fallback(dnsStrategy(co,
					s.String("default_strategy")), "UseIP"),
				DisableCache:           !cache,
				ServeStale:             !cache,
				ServeExpiredTTL:        3600,
				DisableFallbackIfMatch: true,
			},
		}
		b.config.Xray = x
		for _, p := range []struct{ typ, tag, key string }{{"tproxy", "tproxy-in", "shunt_listen_port"}, {"direct", "dns-in", "dns_listen_port"}} {
			in, e := xray.Inbound(p.typ, p.tag, uint16(s.Number(p.key)), true)
			if e != nil {
				return nil, e
			}
			x.InboundConfigs = append(x.InboundConfigs, in)
		}
		for _, n := range c.Of("proxy_node") {
			if n.String("enabled") == "1" {
				out, e := xray.Socks(n.String("name"), uint16(n.Number("socks_port")))
				if e != nil {
					return nil, e
				}
				if out.Tag == final {
					x.OutboundConfigs = append([]xr.OutboundDetourConfig{out}, x.OutboundConfigs...)
				} else {
					x.OutboundConfigs = append(x.OutboundConfigs, out)
				}
			}
		}
		settings, e := core.RawSettings(xr.FreedomConfig{})
		if e != nil {
			return nil, e
		}
		direct := xr.OutboundDetourConfig{Protocol: "freedom", Tag: "direct-out", Settings: settings, StreamSetting: &xr.StreamConfig{SocketSettings: &xr.SocketConfig{DomainStrategy: "UseIP"}}}
		if final == "direct-out" {
			x.OutboundConfigs = append([]xr.OutboundDetourConfig{direct}, x.OutboundConfigs...)
		} else {
			x.OutboundConfigs = append(x.OutboundConfigs, direct)
		}
		dnsSettings, e := core.RawSettings(xr.DNSOutboundConfig{Rules: []*xr.DNSOutboundRuleConfig{
			{Action: "hijack", QType: &xr.PortList{Range: []xr.PortRange{{From: 1, To: 1}, {From: 28, To: 28}}}},
			{Action: "return", RCode: 5},
		}})
		if e != nil {
			return nil, e
		}
		x.OutboundConfigs = append(x.OutboundConfigs, xr.OutboundDetourConfig{Protocol: "blackhole", Tag: "block"}, xr.OutboundDetourConfig{Protocol: "dns", Tag: "dns-out", Settings: dnsSettings})
	}
	return b, nil
}
func (b *shuntBuilder) addSet(set sb.RuleSet) {
	if set.Type == "remote" && b.settings.String("ruleset_out_node") != "" {
		set.RemoteOptions.HTTPClient = &sb.HTTPClientOptions{DialerOptions: sb.DialerOptions{Detour: "ruleset-out"}}
	}
	tag := set.Tag[0]
	sets := &b.config.SingBox.Route.RuleSet
	if i, ok := b.setIndex[tag]; ok {
		(*sets)[i] = set
	} else {
		b.setIndex[tag] = len(*sets)
		*sets = append(*sets, set)
	}
}
func (b *shuntBuilder) addSingBoxRule(r rule, out string, version int) {
	match := r.sbMatch()
	match.IPVersion = version
	action := sb.RuleAction{Action: "route", RouteOptions: sb.RouteActionOptions{Outbound: out}}
	if out == "block" {
		action = sb.RuleAction{Action: "reject"}
	}
	b.config.SingBox.Route.Rules = append(b.config.SingBox.Route.Rules, sb.Rule{Type: "default", DefaultOptions: sb.DefaultRule{RawDefaultRule: match, RuleAction: action}})
}
func (b *shuntBuilder) addDNS(s uci.Section, name, out string, r rule) error {
	if out == "block" {
		return fmt.Errorf("rule %q DNS exit cannot be Block", name)
	}
	tag := name + "-dns"
	node := b.dnsNodes[s.Value("dns_node", b.resolver)]
	if b.config.SingBox != nil {
		d, e := sbDNSServer(node, tag, out)
		if e != nil {
			return e
		}
		dns := b.config.SingBox.DNS
		dns.Servers = append(dns.Servers, d)
		dns.Rules = append(dns.Rules, sb.DNSRule{
			Type: "default",
			DefaultOptions: sb.DefaultDNSRule{
				RawDefaultDNSRule: r.sbDNSMatch(),
				DNSRuleAction: sb.DNSRuleAction{
					Action: "route",
					RouteOptions: sb.DNSRouteActionOptions{
						Server: tag,
						AbstractDNSRouteActionOptions: sb.AbstractDNSRouteActionOptions{
							Strategy:     sbStrategy(s.String("dns_strategy")),
							DisableCache: true,
						},
					},
				},
			},
		})
	} else {
		d, e := xrDNSServer(node, tag)
		if e != nil {
			return e
		}
		d.Domains = r.xrDomain()
		d.QueryStrategy = dnsStrategy("xray", s.String("dns_strategy"))
		b.config.Xray.DNSConfig.Servers = append(b.config.Xray.DNSConfig.Servers, d)
		if _, ok := b.dnsExits[out]; !ok {
			b.exitOrder = append(b.exitOrder, out)
		}
		b.dnsExits[out] = append(b.dnsExits[out], tag)
	}
	return nil
}
func (b *shuntBuilder) finish() (*core.Config, error) {
	if x := b.config.Xray; x != nil {
		d, e := xrDNSServer(b.dnsNodes[b.resolver], "default-dns")
		if e != nil {
			return nil, e
		}
		d.SkipFallback = false
		x.DNSConfig.Servers = append(x.DNSConfig.Servers, d)
		routes := []core.XrayRouteRule{{InboundTag: []string{"dns-in"}, OutboundTag: "dns-out"}}
		for _, out := range b.exitOrder {
			routes = append(routes, core.XrayRouteRule{InboundTag: b.dnsExits[out], OutboundTag: out})
		}
		for _, r := range append(routes, b.xrRoutes...) {
			data, e := json.Marshal(r)
			if e != nil {
				return nil, e
			}
			x.RouterConfig.RuleList = append(x.RouterConfig.RuleList, data)
		}
	}
	return b.config, nil
}

// Reject invalid ports before conversion to the native uint16 representation.
func validateRulePorts(s uci.Section) error {
	for _, p := range s.List("port") {
		n, e := strconv.Atoi(p)
		if e != nil || n < 1 || n > 65535 {
			return fmt.Errorf("invalid rule port %q", p)
		}
	}
	return nil
}
