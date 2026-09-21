package main

import "fmt"

func dnsStrategy(co, s string) string {
	if co == "xray" {
		switch s {
		case "4":
			return "UseIPv4"
		case "6":
			return "UseIPv6"
		case "64", "46":
			return "UseIP"
		}
	} else {
		switch s {
		case "4":
			return "ipv4_only"
		case "6":
			return "ipv6_only"
		case "64":
			return "prefer_ipv6"
		case "46":
			return "prefer_ipv4"
		}
	}
	return ""
}
func (c config) shunt() (*coreConfig, error) {
	s := c.first("shunt")
	co := s.str("type")
	if co == "singbox" {
		co = "sing-box"
	}
	if co != "xray" && co != "sing-box" {
		return nil, fmt.Errorf("unsupported shunt core %q", co)
	}
	for _, k := range []string{"shunt_listen_port", "dns_listen_port"} {
		if e := port(s, k); e != nil {
			return nil, e
		}
	}
	dnsNodes := map[string]section{}
	for _, n := range c.of("shunt_dns_node") {
		if n.str("enabled") != "0" {
			tag := n.str("tag")
			if _, ok := dnsNodes[tag]; ok {
				return nil, fmt.Errorf("duplicate DNS tag %q", tag)
			}
			dnsNodes[tag] = n
		}
	}
	checkOut := func(name string, required bool) error {
		if name == "" && !required {
			return nil
		}
		if name == "hijpass-direct" || name == "hijpass-block" {
			return nil
		}
		_, err := c.node(name)
		return err
	}
	if err := checkOut(s.str("default_proxy_node"), true); err != nil {
		return nil, err
	}
	if s.str("default_proxy_node") == "hijpass-block" {
		return nil, fmt.Errorf("default DNS exit cannot be Block")
	}
	for _, k := range []string{"ruleset_out_node"} {
		if err := checkOut(s.str(k), false); err != nil {
			return nil, err
		}
	}
	final := outTag(s.str("default_proxy_node"))
	resolver := s.str("default_dns_node")
	if dnsNodes[resolver] == nil {
		return nil, fmt.Errorf("default DNS %q missing or disabled", resolver)
	}
	b, err := newShunt(c, s, co, final, resolver, dnsNodes)
	if err != nil {
		return nil, err
	}
	for _, rs := range c.of("shunt_route_rule") {
		if rs.str("enabled") != "1" {
			continue
		}
		if e := validateRulePorts(rs); e != nil {
			return nil, e
		}
		split := rs.str("ip_version_split") == "1"
		versions := []int{0}
		if split {
			versions = []int{4, 6}
			if rs.str("proxy_node_v4") == "" && rs.str("proxy_node_v6") == "" {
				return nil, fmt.Errorf("split rule %q has no exit", rs.str("name"))
			}
		}
		if e := checkOut(rs.str("dns_proxy_node"), false); e != nil {
			return nil, e
		}
		var splitRule *rule
		for _, version := range versions {
			name := rs.str("name")
			out := rs.str("proxy_node")
			if version > 0 {
				out = rs.str(fmt.Sprintf("proxy_node_v%d", version))
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
			r := parseRule(rs)
			hasDNS := r.hasDomain()
			if co == "sing-box" {
				hasDNS = hasDNS || len(r.sets) > 0 || s.str("ruleset_convert") == "1" && len(r.geoSite) > 0
				if s.str("ruleset_convert") == "1" {
					r.convertGeo()
				} else if len(r.geoSite)+len(r.geoIP) > 0 {
					r.geoSite = nil
					r.geoIP = nil
					if !r.hasDomain() && len(r.ip)+len(r.sets) == 0 {
						continue
					}
				}
				if r.empty(false) {
					continue
				}
				for _, set := range r.sets {
					b.addSet(set)
				}
				b.addSingBoxRule(r, out, version)

			} else {
				hasDNS = hasDNS || len(r.geoSite) > 0
				if r.empty(true) || len(r.sets) > 0 && !r.hasDomain() && len(r.ip)+len(r.geoSite)+len(r.geoIP) == 0 {
					continue
				}
				for _, p := range r.protocol {
					if p != "http" && p != "tls" && p != "quic" && p != "bittorrent" {
						return nil, fmt.Errorf("unsupported Xray route protocol %q", p)
					}
				}
				if out == "" {
					out = final
				}
				b.xrRoutes = append(b.xrRoutes, r.xrRules(name, out, version)...)
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
			if hasDNS || co == "sing-box" && len(r.ip)+len(r.sets) > 0 {
				detour := outTag(rs.str("dns_proxy_node"))
				if detour == "" {
					detour = out
				}
				if e := b.addDNS(rs, name, detour, r); e != nil {
					return nil, e
				}
			}
		}
		if splitRule != nil {
			out := outTag(rs.str("dns_proxy_node"))
			if out == "" {
				return nil, fmt.Errorf("split rule %q requires a DNS exit", rs.str("name"))
			}
			if e := b.addDNS(rs, rs.str("name"), out, *splitRule); e != nil {
				return nil, e
			}
		}
	}
	return b.finish()
}
