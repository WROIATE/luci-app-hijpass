package routing

import (
	"fmt"

	"hijpass/config/dns"
	"hijpass/config/routing/match"
	"hijpass/config/uci"
)

// Settings are decoded at the boundary; native builders do not read UCI fields.
type Settings struct {
	Core                     string
	ListenPort, DNSPort      uint16
	LogLevel, Strategy       string
	UseCache, ConvertGeo     bool
	DefaultProxy, DefaultDNS string
	RuleSetProxy, RuleSetDNS string
}

func decodeSettings(s uci.Section) (Settings, error) {
	settings := Settings{
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
	DNS                               dns.Policy
	Match                             match.Rule
}

func decodeRoute(s uci.Section) (route, error) {
	r := route{
		Name: s.String("name"), Split: s.String("ip_version_split") == "1",
		Exit: s.String("proxy_node"), IPv4Exit: s.String("proxy_node_v4"), IPv6Exit: s.String("proxy_node_v6"),
		DNSExit: s.String("dns_proxy_node"), DNS: dns.Policy{Server: s.String("dns_node"), Strategy: s.String("dns_strategy")},
	}
	if err := validateRulePorts(s); err != nil {
		return r, err
	}
	r.Match = match.Parse(s)
	return r, nil
}
