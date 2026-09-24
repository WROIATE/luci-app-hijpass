package generator

import (
	"encoding/json"
	"fmt"

	"hijpass/config/generator/protocol"
	"hijpass/config/generator/singbox"
	"hijpass/config/generator/xray"
	"hijpass/config/uci"

	sb "github.com/sagernet/sing-box/option"
	xr "github.com/xtls/xray-core/infra/conf"
)

type routingConfig struct {
	settings routingSettings
	entries  []route
}

func prepareRouting(c Snapshot, proxies []protocol.Config) (*routingConfig, error) {
	byName := make(map[string]protocol.Config, len(proxies))
	for _, node := range proxies {
		byName[node.Base().Name] = node
	}
	dnsNodes, err := decodeDNS(c.Of("shunt_dns_node"))
	if err != nil {
		return nil, err
	}
	settings, err := decodeSettings(c.First("shunt"), byName, dnsNodes)
	if err != nil {
		return nil, err
	}
	var entries []route
	for _, rs := range c.Of("shunt_route_rule") {
		if rs.String("enabled") != "1" {
			continue
		}
		entry, err := decodeRoute(rs, byName, dnsNodes, settings.DefaultDNS)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return &routingConfig{settings: settings, entries: entries}, nil
}

func buildRouting(proxies []protocol.Config, prepared *routingConfig) (json.Marshaler, error) {
	settings, entries := prepared.settings, prepared.entries
	co := settings.Core
	b, err := newBuilder(proxies, settings)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		split := entry.Split
		versions := []int{0}
		if split {
			versions = []int{4, 6}
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
				if name != "" {
					name += fmt.Sprintf("-ipv%d", version)
				}
			}
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
				detour := entry.DNSExit
				if detour == "" {
					detour = out
				}
				if e := b.dns.Add(entry.DNS, name, detour, r); e != nil {
					return nil, e
				}
			}
		}
		if splitRule != nil {
			out := entry.DNSExit
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

// resolveExit converts UCI node names to output tags at the input boundary.
// Direct, Block and inherited exits do not correspond to proxy objects.
func resolveExit(name string, required bool, nodes map[string]protocol.Config) (string, error) {
	switch name {
	case "":
		if !required {
			return "", nil
		}
		return "", fmt.Errorf("proxy exit is required")
	case "hijpass-direct":
		return "direct-out", nil
	case "hijpass-block":
		return "block", nil
	default:
		if node := nodes[name]; node != nil {
			return node.Base().Name, nil
		}
	}
	return "", fmt.Errorf("proxy node %q missing or disabled", name)
}

// routingSettings contain resolved references; builders do not read UCI fields.
type routingSettings struct {
	Core                   string
	ListenPort, DNSPort    uint16
	LogLevel, Strategy     string
	UseCache, ConvertGeo   bool
	Final, RuleSetExit     string
	DefaultDNS, RuleSetDNS *dnsServer
	RuleSetProxy           protocol.Config
}

func decodeSettings(s uci.Section, nodes map[string]protocol.Config, servers dnsCatalog) (routingSettings, error) {
	settings := routingSettings{
		Core: s.String("type"), LogLevel: s.Value("log_level", "info"),
		Strategy: s.Value("default_strategy", "64"), UseCache: s.String("use_cache") == "1",
		ConvertGeo: s.String("ruleset_convert") == "1",
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
	var err error
	settings.Final, err = resolveExit(s.String("default_proxy_node"), true, nodes)
	if err != nil {
		return settings, err
	}
	if settings.Final == "block" {
		return settings, fmt.Errorf("default DNS exit cannot be Block")
	}
	settings.DefaultDNS, err = servers.lookup(s.String("default_dns_node"))
	if err != nil {
		return settings, err
	}
	settings.RuleSetExit, err = resolveExit(s.String("ruleset_out_node"), false, nodes)
	if err != nil {
		return settings, err
	}
	if settings.Core == "sing-box" && settings.RuleSetExit != "" {
		if settings.RuleSetExit == "block" {
			return settings, fmt.Errorf("rule-set download exit cannot be Block")
		}
		settings.RuleSetProxy = nodes[s.String("ruleset_out_node")]
		if name := s.String("ruleset_dns_node"); name != "" {
			settings.RuleSetDNS, err = servers.lookup(name)
			if err != nil {
				return settings, err
			}
		}
	}
	return settings, nil
}

type route struct {
	Name                              string
	Split                             bool
	Exit, IPv4Exit, IPv6Exit, DNSExit string
	DNS                               dnsPolicy
	Match                             rule
}

func decodeRoute(s uci.Section, nodes map[string]protocol.Config, servers dnsCatalog, defaultDNS *dnsServer) (route, error) {
	r := route{Name: s.String("name"), Split: s.String("ip_version_split") == "1"}
	var err error
	r.DNSExit, err = resolveExit(s.String("dns_proxy_node"), false, nodes)
	if err != nil {
		return r, err
	}

	if r.Split {
		r.IPv4Exit, err = resolveExit(s.String("proxy_node_v4"), true, nodes)
		if err != nil {
			return r, fmt.Errorf("rule %q proxy_node_v4: %w", r.Name, err)
		}
		r.IPv6Exit, err = resolveExit(s.String("proxy_node_v6"), true, nodes)
		if err != nil {
			return r, fmt.Errorf("rule %q proxy_node_v6: %w", r.Name, err)
		}
	} else {
		r.Exit, err = resolveExit(s.String("proxy_node"), true, nodes)
		if err != nil {
			return r, fmt.Errorf("rule %q proxy_node: %w", r.Name, err)
		}
	}
	r.DNS = dnsPolicy{Server: defaultDNS, Strategy: s.String("dns_strategy")}
	if name := s.String("dns_node"); name != "" {
		r.DNS.Server, err = servers.lookup(name)
		if err != nil {
			return r, err
		}
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

func newBuilder(nodes []protocol.Config, s routingSettings) (*builder, error) {
	b := &builder{settings: s, setIndex: map[string]int{}}
	if s.Core == "sing-box" {
		dns, err := singBoxDNS(s.DefaultDNS, s.DefaultDNS.Tag, s.Final)
		if err != nil {
			return nil, err
		}
		options := singbox.RoutingOptions{
			ListenPort: s.ListenPort, DNSPort: s.DNSPort, LogLevel: s.LogLevel, Strategy: s.Strategy, UseCache: s.UseCache,
			Final: s.Final, DefaultDNS: dns, RuleSetProxy: s.RuleSetProxy, RuleSetDirect: s.RuleSetExit == "direct-out",
		}
		if s.RuleSetDNS != nil {
			server, err := singBoxDNS(s.RuleSetDNS, "ruleset-dns-resolver", "ruleset-out")
			if err != nil {
				return nil, err
			}
			options.RuleSetDNS = &server
		}

		b.config = (*SingBoxConfig)(singbox.BuildRouting(options, nodes))
	} else {
		options, err := xray.BuildRouting(xray.RoutingOptions{
			ListenPort: s.ListenPort, DNSPort: s.DNSPort, LogLevel: s.LogLevel, Strategy: s.Strategy, UseCache: s.UseCache, Final: s.Final,
		}, nodes)
		if err != nil {
			return nil, err
		}
		b.config = (*XrayConfig)(options)
	}
	b.dns = &dnsPlan{config: b.config, resolver: s.DefaultDNS, dnsExits: map[string][]string{}}
	return b, nil
}
func (b *builder) addSet(set sb.RuleSet) {
	if set.Type == "remote" && b.settings.RuleSetExit != "" {
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
	Tag, Type, Address string
	Port               uint16
}
type dnsCatalog map[string]*dnsServer

func (c dnsCatalog) lookup(name string) (*dnsServer, error) {
	if server := c[name]; server != nil {
		return server, nil
	}
	return nil, fmt.Errorf("DNS node %q missing or disabled", name)
}

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
		out[tag] = &dnsServer{Tag: tag, Type: s.String("type"), Address: s.String("server"), Port: uint16(s.Number("port"))}
	}
	return out, nil
}

// Policy selects the DNS server and strategy for a routing rule.
type dnsPolicy struct {
	Server   *dnsServer
	Strategy string
}

type dnsPlan struct {
	config    json.Marshaler
	resolver  *dnsServer
	dnsExits  map[string][]string
	exitOrder []string
}

func (b *dnsPlan) Add(policy dnsPolicy, name, out string, r rule) error {
	if out == "block" {
		return fmt.Errorf("rule %q DNS exit cannot be Block", name)
	}
	tag := name + "-dns"
	node := policy.Server
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
	d, err := xrayDNS(b.resolver, "default-dns")
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
