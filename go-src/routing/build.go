package routing

import (
	"fmt"

	"hijpass/config/config"
	"hijpass/config/core"
	"hijpass/config/dns"
	"hijpass/config/proxy"
	"hijpass/config/routing/match"
)

func Build(c config.Snapshot, nodes *proxy.Catalog) (*core.Config, error) {
	settings, err := decodeSettings(c.First("shunt"))
	if err != nil {
		return nil, err
	}
	co := settings.Core
	dnsNodes, err := dns.Decode(c.Of("shunt_dns_node"))
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
		var splitRule *match.Rule
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
