package routing

import (
	"hijpass/config/core"
	"hijpass/config/core/xray"
	"hijpass/config/dns"
	"hijpass/config/proxy"

	xr "github.com/xtls/xray-core/infra/conf"
)

func buildXray(b *builder, nodes *proxy.Catalog, s Settings, final string) error {
	endpoints, err := nodes.Endpoints()
	if err != nil {
		return err
	}
	cache := s.UseCache
	x := &xr.Config{
		LogConfig:    xray.Log(s.LogLevel),
		RouterConfig: &xr.RouterConfig{DomainStrategy: core.Ptr("AsIs")},
		DNSConfig: &xr.DNSConfig{
			QueryStrategy: core.Fallback(dns.Strategy("xray",
				s.Strategy), "UseIP"),
			DisableCache:           !cache,
			ServeStale:             !cache,
			ServeExpiredTTL:        3600,
			DisableFallbackIfMatch: true,
		},
	}
	b.config.Xray = x
	for _, p := range []struct {
		typ, tag string
		port     uint16
	}{{"tproxy", "tproxy-in", s.ListenPort}, {"direct", "dns-in", s.DNSPort}} {
		in, e := xray.Inbound(p.typ, p.tag, p.port, true)
		if e != nil {
			return e
		}
		x.InboundConfigs = append(x.InboundConfigs, in)
	}
	for _, n := range endpoints {
		out, e := xray.Socks(n.Name, n.Port)
		if e != nil {
			return e
		}
		if out.Tag == final {
			x.OutboundConfigs = append([]xr.OutboundDetourConfig{out}, x.OutboundConfigs...)
		} else {
			x.OutboundConfigs = append(x.OutboundConfigs, out)
		}
	}
	settings, e := core.RawSettings(xr.FreedomConfig{})
	if e != nil {
		return e
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
		return e
	}
	x.OutboundConfigs = append(x.OutboundConfigs, xr.OutboundDetourConfig{Protocol: "blackhole", Tag: "block"}, xr.OutboundDetourConfig{Protocol: "dns", Tag: "dns-out", Settings: dnsSettings})
	return nil
}
