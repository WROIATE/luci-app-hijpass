package xray

import (
	"hijpass/config/generator/protocol"
	"hijpass/config/generator/wire"

	xr "github.com/xtls/xray-core/infra/conf"
)

const (
	domainStrategyAsIs  = "AsIs"
	domainStrategyUseIP = "UseIP"
)

type RoutingOptions struct {
	ListenPort, DNSPort uint16
	LogLevel, Strategy  string
	UseCache            bool
	Final               string
}

// BuildRouting consumes validated proxy objects with resolved dependencies.
func BuildRouting(s RoutingOptions, nodes []protocol.Config) (*xr.Config, error) {
	final := s.Final
	cache := s.UseCache
	x := &xr.Config{
		LogConfig:    Log(s.LogLevel),
		RouterConfig: &xr.RouterConfig{DomainStrategy: new(domainStrategyAsIs)},
		DNSConfig: &xr.DNSConfig{
			QueryStrategy: Fallback(DNSStrategy(
				s.Strategy), domainStrategyUseIP),
			DisableCache:           !cache,
			ServeStale:             !cache,
			ServeExpiredTTL:        3600,
			DisableFallbackIfMatch: true,
		},
	}

	for _, p := range []struct {
		typ, tag string
		port     uint16
	}{{inboundTProxy, wire.TProxyInbound, s.ListenPort}, {"direct", wire.DNSInbound, s.DNSPort}} {
		in, e := Inbound(p.typ, p.tag, p.port, true)
		if e != nil {
			return nil, e
		}
		x.InboundConfigs = append(x.InboundConfigs, in)
	}
	for _, node := range nodes {
		base := node.Base()
		out, e := Socks(base.Name, base.SocksPort)
		if e != nil {
			return nil, e
		}
		if out.Tag == final {
			x.OutboundConfigs = append([]xr.OutboundDetourConfig{out}, x.OutboundConfigs...)
		} else {
			x.OutboundConfigs = append(x.OutboundConfigs, out)
		}
	}
	settings, e := RawSettings(xr.FreedomConfig{})
	if e != nil {
		return nil, e
	}
	direct := xr.OutboundDetourConfig{
		Protocol: "freedom",
		Tag:      wire.DirectOutbound,
		Settings: settings,
		StreamSetting: &xr.StreamConfig{
			SocketSettings: &xr.SocketConfig{DomainStrategy: domainStrategyUseIP},
		},
	}
	if final == wire.DirectOutbound {
		x.OutboundConfigs = append([]xr.OutboundDetourConfig{direct}, x.OutboundConfigs...)
	} else {
		x.OutboundConfigs = append(x.OutboundConfigs, direct)
	}
	dnsSettings, e := RawSettings(xr.DNSOutboundConfig{Rules: []*xr.DNSOutboundRuleConfig{
		{Action: "hijack", QType: &xr.PortList{Range: []xr.PortRange{{From: 1, To: 1}, {From: 28, To: 28}}}},
		{Action: "return", RCode: 5},
	}})
	if e != nil {
		return nil, e
	}
	x.OutboundConfigs = append(x.OutboundConfigs, xr.OutboundDetourConfig{Protocol: "blackhole", Tag: wire.BlockOutbound}, xr.OutboundDetourConfig{Protocol: "dns", Tag: wire.DNSOutbound, Settings: dnsSettings})
	return x, nil
}

// Xray's field rule is private in infra/conf/router.go.
type XrayRouteRule struct {
	RuleTag     string   `json:"ruleTag,omitempty"`
	InboundTag  []string `json:"inboundTag,omitempty"`
	OutboundTag string   `json:"outboundTag,omitempty"`
	BalancerTag string   `json:"balancerTag,omitempty"`
	Network     []string `json:"network,omitempty"`
	Protocol    []string `json:"protocol,omitempty"`
	Port        string   `json:"port,omitempty"`
	Domain      []string `json:"domain,omitempty"`
	IP          []string `json:"ip,omitempty"`
}
