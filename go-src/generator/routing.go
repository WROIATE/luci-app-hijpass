package generator

import (
	"encoding/json"
	"fmt"

	"hijpass/config/generator/singbox"
	"hijpass/config/generator/xray"
	"hijpass/config/uci"

	sb "github.com/sagernet/sing-box/option"
	xr "github.com/xtls/xray-core/infra/conf"
)

func buildRouting(c Snapshot, nodes *proxyCatalog) (json.Marshaler, error) {
	settings, err := decodeSettings(c.First("shunt"))
	if err != nil {
		return nil, err
	}
	co := settings.Core
	dnsNodes, err := decodeDNS(c.Of("shunt_dns_node"))
	if err != nil {
		return nil, err
	}
	checkOut := func(name string, required bool) error {
		if name == "" && !required {
			return nil
		}
		if name == "hijpass-direct" || name == "hijpass-block" {
			return nil
		}
		_, err := nodes.Port(name)
		return err
	}
	if err := checkOut(settings.DefaultProxy, true); err != nil {
		return nil, err
	}
	if settings.DefaultProxy == "hijpass-block" {
		return nil, fmt.Errorf("default DNS exit cannot be Block")
	}
	if err := checkOut(settings.RuleSetProxy, false); err != nil {
		return nil, err
	}
	final := outTag(settings.DefaultProxy)
	resolver := settings.DefaultDNS
	if dnsNodes[resolver] == nil {
		return nil, fmt.Errorf("default DNS %q missing or disabled", resolver)
	}
	b, err := newBuilder(nodes, settings, final, resolver, dnsNodes)
	if err != nil {
		return nil, err
	}
	for _, rs := range c.Of("shunt_route_rule") {
		if rs.String("enabled") != "1" {
			continue
		}
		entry, err := decodeRoute(rs)
		if err != nil {
			return nil, err
		}
		split := entry.Split
		versions := []int{0}
		if split {
			versions = []int{4, 6}
			if entry.IPv4Exit == "" && entry.IPv6Exit == "" {
				return nil, fmt.Errorf("split rule %q has no exit", entry.Name)
			}
		}
		if e := checkOut(entry.DNSExit, false); e != nil {
			return nil, e
		}
		var splitRule *rule
		for _, version := range versions {
			name := entry.Name
			out := entry.Exit
			if version > 0 {
				out = entry.IPv4Exit
				if version == 6 {
					out = entry.IPv6Exit
				}
				if out == "" {
					continue
				}
				if name != "" {
					name += fmt.Sprintf("-ipv%d", version)
				}
			}
			if e := checkOut(out, false); e != nil {
				return nil, e
			}
			out = outTag(out)
			r := entry.Match
			hasDNS := r.HasDomain()
			if co == "sing-box" {
				hasDNS = hasDNS || len(r.Sets) > 0 || settings.ConvertGeo && len(r.GeoSite) > 0
				if settings.ConvertGeo {
					r.ConvertGeo()
				} else if len(r.GeoSite)+len(r.GeoIP) > 0 {
					r.GeoSite = nil
					r.GeoIP = nil
					if !r.HasDomain() && len(r.IP)+len(r.Sets) == 0 {
						continue
					}
				}
				if r.Empty(false) {
					continue
				}
				for _, set := range r.Sets {
					b.addSet(set)
				}
				b.addSingBoxRule(r, out, version)

			} else {
				hasDNS = hasDNS || len(r.GeoSite) > 0
				if r.Empty(true) || len(r.Sets) > 0 && !r.HasDomain() && len(r.IP)+len(r.GeoSite)+len(r.GeoIP) == 0 {
					continue
				}
				for _, p := range r.Protocol {
					if p != "http" && p != "tls" && p != "quic" && p != "bittorrent" {
						return nil, fmt.Errorf("unsupported Xray route protocol %q", p)
					}
				}
				if out == "" {
					out = final
				}
				b.xrRoutes = append(b.xrRoutes, r.XrayRules(name, out, version)...)
			}
			if out == "block" {
				continue
			}
			if split {
				if hasDNS && splitRule == nil {
					copy := r
					splitRule = &copy
				}
				continue
			}
			if hasDNS || co == "sing-box" && len(r.IP)+len(r.Sets) > 0 {
				detour := outTag(entry.DNSExit)
				if detour == "" {
					detour = out
				}
				if e := b.dns.Add(entry.DNS, name, detour, r); e != nil {
					return nil, e
				}
			}
		}
		if splitRule != nil {
			out := outTag(entry.DNSExit)
			if out == "" {
				return nil, fmt.Errorf("split rule %q requires a DNS exit", entry.Name)
			}
			if e := b.dns.Add(entry.DNS, entry.Name, out, *splitRule); e != nil {
				return nil, e
			}
		}
	}
	return b.finish()
}

func outTag(s string) string {
	switch s {
	case "hijpass-direct":
		return "direct-out"
	case "hijpass-block":
		return "block"
	}
	return s
}

// routingSettings are decoded at the boundary; native builders do not read UCI fields.
type routingSettings struct {
	Core                     string
	ListenPort, DNSPort      uint16
	LogLevel, Strategy       string
	UseCache, ConvertGeo     bool
	DefaultProxy, DefaultDNS string
	RuleSetProxy, RuleSetDNS string
}

func decodeSettings(s uci.Section) (routingSettings, error) {
	settings := routingSettings{
		Core: s.String("type"), LogLevel: s.Value("log_level", "info"),
		Strategy: s.Value("default_strategy", "64"), UseCache: s.String("use_cache") == "1",
		ConvertGeo: s.String("ruleset_convert") == "1", DefaultProxy: s.String("default_proxy_node"),
		DefaultDNS: s.String("default_dns_node"), RuleSetProxy: s.String("ruleset_out_node"), RuleSetDNS: s.String("ruleset_dns_node"),
	}
	if settings.Core == "singbox" {
		settings.Core = "sing-box"
	}
	if settings.Core != "xray" && settings.Core != "sing-box" {
		return settings, fmt.Errorf("unsupported shunt core %q", settings.Core)
	}
	for _, key := range []string{"shunt_listen_port", "dns_listen_port"} {
		if err := uci.ValidatePort(s, key); err != nil {
			return settings, err
		}
	}
	settings.ListenPort = uint16(s.Number("shunt_listen_port"))
	settings.DNSPort = uint16(s.Number("dns_listen_port"))
	return settings, nil
}

type route struct {
	Name                              string
	Split                             bool
	Exit, IPv4Exit, IPv6Exit, DNSExit string
	DNS                               dnsPolicy
	Match                             rule
}

func decodeRoute(s uci.Section) (route, error) {
	r := route{
		Name: s.String("name"), Split: s.String("ip_version_split") == "1",
		Exit: s.String("proxy_node"), IPv4Exit: s.String("proxy_node_v4"), IPv6Exit: s.String("proxy_node_v6"),
		DNSExit: s.String("dns_proxy_node"), DNS: dnsPolicy{Server: s.String("dns_node"), Strategy: s.String("dns_strategy")},
	}
	if err := validateRulePorts(s); err != nil {
		return r, err
	}
	r.Match = parseRule(s)
	return r, nil
}

type builder struct {
	config   json.Marshaler
	settings routingSettings
	dns      *dnsPlan
	xrRoutes []xray.XrayRouteRule
	setIndex map[string]int
}

func newBuilder(nodes *proxyCatalog, s routingSettings, final, resolver string, servers dnsCatalog) (*builder, error) {
	b := &builder{settings: s, setIndex: map[string]int{}}
	names := nodes.names()
	if s.Core == "sing-box" {
		options, err := singbox.BuildRouting(singbox.RoutingOptions{
			ListenPort: s.ListenPort, DNSPort: s.DNSPort, LogLevel: s.LogLevel, Strategy: s.Strategy, UseCache: s.UseCache,
			Final: final, Resolver: resolver, RuleSetProxy: s.RuleSetProxy, RuleSetDNS: s.RuleSetDNS,
		}, names, nodes.Port, func(name, tag, out string) (sb.DNSServerOptions, error) { return singBoxDNS(servers[name], tag, out) })
		if err != nil {
			return nil, err
		}
		b.config = (*SingBoxConfig)(options)
	} else {
		options, err := xray.BuildRouting(xray.RoutingOptions{
			ListenPort: s.ListenPort, DNSPort: s.DNSPort, LogLevel: s.LogLevel, Strategy: s.Strategy, UseCache: s.UseCache, Final: final,
		}, names, nodes.Port)
		if err != nil {
			return nil, err
		}
		b.config = (*XrayConfig)(options)
	}
	b.dns = newDNSPlan(b.config, servers, resolver)
	return b, nil
}
func (b *builder) addSet(set sb.RuleSet) {
	if set.Type == "remote" && b.settings.RuleSetProxy != "" {
		set.RemoteOptions.HTTPClient = &sb.HTTPClientOptions{Detour: "ruleset-out"}
	}
	tag := set.Tag[0]
	sets := &b.config.(*SingBoxConfig).Route.RuleSet
	if i, ok := b.setIndex[tag]; ok {
		(*sets)[i] = set
	} else {
		b.setIndex[tag] = len(*sets)
		*sets = append(*sets, set)
	}
}
func (b *builder) addSingBoxRule(r rule, out string, version int) {
	singbox.AddRule((*sb.Options)(b.config.(*SingBoxConfig)), r.SingBox(), out, version)
}

func (b *builder) finish() (json.Marshaler, error) {
	routes, err := b.dns.Finish()
	if err != nil {
		return nil, err
	}
	if x, ok := b.config.(*XrayConfig); ok {
		for _, r := range append(routes, b.xrRoutes...) {
			data, err := json.Marshal(r)
			if err != nil {
				return nil, err
			}
			x.RouterConfig.RuleList = append(x.RouterConfig.RuleList, data)
		}
	}
	return b.config, nil
}

// Server is independent of the UCI representation and native core schemas.
type dnsServer struct {
	Type, Address string
	Port          uint16
}
type dnsCatalog map[string]*dnsServer

func decodeDNS(sections []uci.Section) (dnsCatalog, error) {
	out := dnsCatalog{}
	for _, s := range sections {
		if s.String("enabled") == "0" {
			continue
		}
		tag := s.String("tag")
		if _, ok := out[tag]; ok {
			return nil, fmt.Errorf("duplicate DNS tag %q", tag)
		}
		if s.String("port") != "" {
			if err := uci.ValidatePort(s, "port"); err != nil {
				return nil, err
			}
		}
		out[tag] = &dnsServer{Type: s.String("type"), Address: s.String("server"), Port: uint16(s.Number("port"))}
	}
	return out, nil
}

// Policy selects the DNS server and strategy for a routing rule.
type dnsPolicy struct{ Server, Strategy string }

type dnsPlan struct {
	config    json.Marshaler
	servers   dnsCatalog
	resolver  string
	dnsExits  map[string][]string
	exitOrder []string
}

func newDNSPlan(config json.Marshaler, servers dnsCatalog, resolver string) *dnsPlan {
	return &dnsPlan{config: config, servers: servers, resolver: resolver, dnsExits: map[string][]string{}}
}
func (b *dnsPlan) Add(policy dnsPolicy, name, out string, r rule) error {
	if out == "block" {
		return fmt.Errorf("rule %q DNS exit cannot be Block", name)
	}
	tag := name + "-dns"
	node := b.servers[fallback(policy.Server, b.resolver)]
	if config, ok := b.config.(*SingBoxConfig); ok {
		d, e := singBoxDNS(node, tag, out)
		if e != nil {
			return e
		}
		singbox.AddDNSRule((*sb.Options)(config), d, r.SingBoxDNS(), policy.Strategy)
	} else {
		d, e := xrayDNS(node, tag)
		if e != nil {
			return e
		}
		d.Domains = r.XrayDomains()
		d.QueryStrategy = xray.DNSStrategy(policy.Strategy)
		config := b.config.(*XrayConfig)
		config.DNSConfig.Servers = append(config.DNSConfig.Servers, d)
		if _, ok := b.dnsExits[out]; !ok {
			b.exitOrder = append(b.exitOrder, out)
		}
		b.dnsExits[out] = append(b.dnsExits[out], tag)
	}
	return nil
}

func (b *dnsPlan) Finish() ([]xray.XrayRouteRule, error) {
	config, ok := b.config.(*XrayConfig)
	if !ok {
		return nil, nil
	}
	d, err := xrayDNS(b.servers[b.resolver], "default-dns")
	if err != nil {
		return nil, err
	}
	d.SkipFallback = false
	config.DNSConfig.Servers = append(config.DNSConfig.Servers, d)
	routes := []xray.XrayRouteRule{{InboundTag: []string{"dns-in"}, OutboundTag: "dns-out"}}
	for _, out := range b.exitOrder {
		routes = append(routes, xray.XrayRouteRule{InboundTag: b.dnsExits[out], OutboundTag: out})
	}
	return routes, nil
}

func singBoxDNS(s *dnsServer, tag, out string) (sb.DNSServerOptions, error) {
	if s == nil {
		return sb.DNSServerOptions{}, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	return singbox.DNSServer(s.Type, s.Address, s.Port, tag, out)
}
func xrayDNS(s *dnsServer, tag string) (*xr.NameServerConfig, error) {
	if s == nil {
		return nil, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	return xray.DNSServer(s.Type, s.Address, s.Port, tag)
}
func fallback(s, defaultValue string) string {
	if s == "" {
		return defaultValue
	}
	return s
}
