package main

import (
	"encoding/json"
	"fmt"
	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
	xr "github.com/xtls/xray-core/infra/conf"
	"net"
	"strconv"
)

type shuntBuilder struct {
	config    *coreConfig
	settings  section
	dnsNodes  map[string]section
	resolver  string
	xrRoutes  []xrayRouteRule
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
func sbDNSServer(s section, tag, detour string) (sb.DNSServerOptions, error) {
	o := sb.DNSServerOptions{Type: s.str("type"), Tag: tag}
	if s == nil {
		return o, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	if s.str("port") != "" {
		if e := port(s, "port"); e != nil {
			return o, e
		}
	}
	remote := sb.RemoteDNSServerOptions{DNSServerAddressOptions: sb.DNSServerAddressOptions{Server: s.str("server"), ServerPort: uint16(s.num("port"))}}
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
func xrDNSServer(s section, tag string) (*xr.NameServerConfig, error) {
	if s == nil {
		return nil, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	if s.str("port") != "" {
		if e := port(s, "port"); e != nil {
			return nil, e
		}
	}
	addr := s.str("server")
	o := &xr.NameServerConfig{Tag: tag, SkipFallback: true}
	switch s.str("type") {
	case "tcp", "quic":
		addr = s.str("type") + "://" + addr
		o.Port = uint16(s.num("port"))
	case "https":
		if s.str("port") != "" {
			addr = net.JoinHostPort(addr, s.str("port"))
		} else if net.ParseIP(addr) != nil && net.ParseIP(addr).To4() == nil {
			addr = "[" + addr + "]"
		}
		addr = "https://" + addr + "/dns-query"
	case "udp":
		o.Port = uint16(s.num("port"))
	default:
		return nil, fmt.Errorf("invalid Xray DNS type %q", s.str("type"))
	}
	o.Address = xrAddress(addr)
	return o, nil
}
func newShunt(c config, s section, co, final, resolver string, dnsNodes map[string]section) (*shuntBuilder, error) {
	b := &shuntBuilder{config: &coreConfig{}, settings: s, resolver: resolver, dnsNodes: dnsNodes, dnsExits: map[string][]string{}, setIndex: map[string]int{}}
	cache := s.str("use_cache") == "1"
	if co == "sing-box" {
		dns := &sb.DNSOptions{RawDNSOptions: sb.RawDNSOptions{Final: resolver, DNSClientOptions: sb.DNSClientOptions{Strategy: sbStrategy(s.val("default_strategy", "64")), DisableCache: !cache, DisableExpire: !cache}}}
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
				Level:     s.val("log_level", "info"),
				Timestamp: true,
			},
			DNS:   dns,
			Route: route,
			Inbounds: []sb.Inbound{
				{
					Type:    "tproxy",
					Tag:     "tproxy-in",
					Options: &sb.TProxyInboundOptions{ListenOptions: sbListen(uint16(s.num("shunt_listen_port")), "::")},
				},
				{
					Type:    "direct",
					Tag:     "dns-in",
					Options: &sb.DirectInboundOptions{ListenOptions: sbListen(uint16(s.num("dns_listen_port")), "::")},
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
		for _, n := range c.of("proxy_node") {
			if n.str("enabled") == "1" {
				o.Outbounds = append(o.Outbounds, sbSocks(n.str("name"), uint16(n.num("socks_port"))))
			}
		}
		d, e := sbDNSServer(dnsNodes[resolver], resolver, final)
		if e != nil {
			return nil, e
		}
		dns.Servers = append(dns.Servers, d)
		if name := s.str("ruleset_out_node"); name != "" {
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
				out = sbSocks("ruleset-out", uint16(node.num("socks_port")))
			}
			if r := s.str("ruleset_dns_node"); r != "" {
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
			LogConfig:    xrLog(s.str("log_level")),
			RouterConfig: &xr.RouterConfig{DomainStrategy: ptr("AsIs")},
			DNSConfig: &xr.DNSConfig{
				QueryStrategy: fallback(dnsStrategy(co,
					s.str("default_strategy")), "UseIP"),
				DisableCache:           !cache,
				ServeStale:             !cache,
				ServeExpiredTTL:        3600,
				DisableFallbackIfMatch: true,
			},
		}
		b.config.Xray = x
		for _, p := range []struct{ typ, tag, key string }{{"tproxy", "tproxy-in", "shunt_listen_port"}, {"direct", "dns-in", "dns_listen_port"}} {
			in, e := xrInbound(p.typ, p.tag, uint16(s.num(p.key)), true)
			if e != nil {
				return nil, e
			}
			x.InboundConfigs = append(x.InboundConfigs, in)
		}
		for _, n := range c.of("proxy_node") {
			if n.str("enabled") == "1" {
				out, e := xrSocks(n.str("name"), uint16(n.num("socks_port")))
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
		settings, e := rawSettings(xr.FreedomConfig{DomainStrategy: "UseIP"})
		if e != nil {
			return nil, e
		}
		direct := xr.OutboundDetourConfig{Protocol: "freedom", Tag: "direct-out", Settings: settings}
		if final == "direct-out" {
			x.OutboundConfigs = append([]xr.OutboundDetourConfig{direct}, x.OutboundConfigs...)
		} else {
			x.OutboundConfigs = append(x.OutboundConfigs, direct)
		}
		dnsSettings, e := rawSettings(xr.DNSOutboundConfig{NonIPQuery: "reject"})
		if e != nil {
			return nil, e
		}
		x.OutboundConfigs = append(x.OutboundConfigs, xr.OutboundDetourConfig{Protocol: "blackhole", Tag: "block"}, xr.OutboundDetourConfig{Protocol: "dns", Tag: "dns-out", Settings: dnsSettings})
	}
	return b, nil
}
func (b *shuntBuilder) addSet(set sb.RuleSet) {
	if set.Type == "remote" && b.settings.str("ruleset_out_node") != "" {
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
func (b *shuntBuilder) addDNS(s section, name, out string, r rule) error {
	if out == "block" {
		return fmt.Errorf("rule %q DNS exit cannot be Block", name)
	}
	tag := name + "-dns"
	node := b.dnsNodes[s.val("dns_node", b.resolver)]
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
							Strategy:     sbStrategy(s.str("dns_strategy")),
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
		d.QueryStrategy = dnsStrategy("xray", s.str("dns_strategy"))
		b.config.Xray.DNSConfig.Servers = append(b.config.Xray.DNSConfig.Servers, d)
		if _, ok := b.dnsExits[out]; !ok {
			b.exitOrder = append(b.exitOrder, out)
		}
		b.dnsExits[out] = append(b.dnsExits[out], tag)
	}
	return nil
}
func (b *shuntBuilder) finish() (*coreConfig, error) {
	if x := b.config.Xray; x != nil {
		d, e := xrDNSServer(b.dnsNodes[b.resolver], "default-dns")
		if e != nil {
			return nil, e
		}
		d.SkipFallback = false
		x.DNSConfig.Servers = append(x.DNSConfig.Servers, d)
		routes := []xrayRouteRule{{InboundTag: []string{"dns-in"}, OutboundTag: "dns-out"}}
		for _, out := range b.exitOrder {
			routes = append(routes, xrayRouteRule{InboundTag: b.dnsExits[out], OutboundTag: out})
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
func validateRulePorts(s section) error {
	for _, p := range s.list("port") {
		n, e := strconv.Atoi(p)
		if e != nil || n < 1 || n > 65535 {
			return fmt.Errorf("invalid rule port %q", p)
		}
	}
	return nil
}
