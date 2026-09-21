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
func dnsServer(co string, s section, tag, detour string) (object, error) {
	if s == nil {
		return nil, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	if co != "xray" {
		o := object{"type": s.str("type"), "tag": tag, "server": s.str("server")}
		if s.num("port") > 0 {
			o["server_port"] = s.num("port")
		}
		if detour != "direct-out" {
			o["detour"] = detour
		}
		return o, nil
	}
	addr := s.str("server")
	o := object{"tag": tag, "skipFallback": true}
	switch s.str("type") {
	case "tcp", "quic":
		addr = s.str("type") + "://" + addr
		o["port"] = s.num("port")
	case "https":
		addr = "https://" + addr
		if s.num("port") > 0 {
			addr += ":" + s.str("port")
		}
		addr += "/dns-query"
	case "udp":
		o["port"] = s.num("port")
	default:
		return nil, fmt.Errorf("invalid Xray DNS type %q", s.str("type"))
	}
	o["address"] = addr
	return o, nil
}
func (c config) shunt() (object, error) {
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
	var outs, servers, dnsRules, routes, sets []object
	route := object{}
	dns := object{}
	strategy := dnsStrategy(co, s.str("default_strategy"))
	cache := s.str("use_cache") == "1"
	if co == "sing-box" {
		outs = []object{{"type": "direct", "tag": "direct-out"}, {"type": "block", "tag": "block"}}
		for _, n := range c.of("proxy_node") {
			if n.str("enabled") == "1" {
				outs = append(outs, socks(co, n.str("name"), n.num("socks_port")))
			}
		}
		routes = []object{{"action": "sniff"}, {"action": "hijack-dns", "protocol": []string{"dns"}}}
		route = object{"final": final, "default_domain_resolver": resolver}
		if strategy == "" {
			strategy = "prefer_ipv6"
		}
		dns = object{"strategy": strategy, "disable_cache": !cache, "disable_expire": !cache, "final": resolver}
		d, e := dnsServer(co, dnsNodes[resolver], resolver, final)
		if e != nil {
			return nil, e
		}
		servers = append(servers, d)
		if n := s.str("ruleset_out_node"); n != "" {
			for _, out := range outs {
				if out["tag"] == outTag(n) {
					copy := copyObj(out)
					copy["tag"] = "ruleset-out"
					if r := s.str("ruleset_dns_node"); r != "" {
						copy["domain_resolver"] = "ruleset-dns-resolver"
						d, e := dnsServer(co, dnsNodes[r], "ruleset-dns-resolver", "ruleset-out")
						if e != nil {
							return nil, e
						}
						servers = append(servers, d)
					}
					outs = append(outs, copy)
					break
				}
			}
		}
	} else {
		for _, n := range c.of("proxy_node") {
			if n.str("enabled") == "1" {
				out := socks(co, n.str("name"), n.num("socks_port"))
				if out["tag"] == final {
					outs = append([]object{out}, outs...)
				} else {
					outs = append(outs, out)
				}
			}
		}
		direct := object{"protocol": "freedom", "tag": "direct-out", "settings": object{"domainStrategy": "UseIP"}}
		if final == "direct-out" {
			outs = append([]object{direct}, outs...)
		} else {
			outs = append(outs, direct)
		}
		outs = append(outs, object{"protocol": "blackhole", "tag": "block"}, object{"protocol": "dns", "tag": "dns-out", "settings": object{"rules": []object{{"action": "hijack", "qType": "1,28"}, {"action": "return", "rCode": 5}}}})
		route = object{"domainStrategy": "AsIs"}
		dnsRules = []object{{"inboundTag": []string{"dns-in"}, "outboundTag": "dns-out"}}
		if strategy == "" {
			strategy = "UseIP"
		}
		dns = object{"queryStrategy": strategy, "disableCache": !cache, "serveStale": !cache, "serveExpiredTTL": 3600, "disableFallback": false, "disableFallbackIfMatch": true}
	}
	// Keep insertion order: both route rules and DNS fallback order are significant.
	dnsExits := map[string][]string{}
	var exitOrder []string
	setIndex := map[string]int{}
	addDNS := func(s section, name, out string, r rule) error {
		if out == "block" {
			return fmt.Errorf("rule %q DNS exit cannot be Block", name)
		}
		tag := name + "-dns"
		node := s.val("dns_node", resolver)
		d, e := dnsServer(co, dnsNodes[node], tag, out)
		if e != nil {
			return e
		}
		if co == "sing-box" {
			dr := r.sbDomain()
			dr["action"] = "route"
			dr["server"] = tag
			dr["strategy"] = dnsStrategy(co, s.str("dns_strategy"))
			dr["disable_cache"] = true
			dnsRules = append(dnsRules, dr)
		} else {
			d["domains"] = r.xrDomain()
			d["queryStrategy"] = dnsStrategy(co, s.str("dns_strategy"))
			if _, ok := dnsExits[out]; !ok {
				exitOrder = append(exitOrder, out)
			}
			dnsExits[out] = append(dnsExits[out], tag)
		}
		servers = append(servers, d)
		return nil
	}
	for _, rs := range c.of("shunt_route_rule") {
		if rs.str("enabled") != "1" {
			continue
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
					if set["type"] == "remote" && s.str("ruleset_out_node") != "" {
						set["http_client"] = object{"detour": "ruleset-out"}
					}
					tag := set["tag"].(string)
					if i, ok := setIndex[tag]; ok {
						sets[i] = set
					} else {
						setIndex[tag] = len(sets)
						sets = append(sets, set)
					}
				}
				rr := r.sbDomain()
				rr["action"] = "route"
				rr["outbound"] = out
				if out == "block" {
					rr["action"] = "reject"
					delete(rr, "outbound")
				}
				rr["network"] = r.network
				rr["protocol"] = r.protocol
				rr["port"] = r.ports
				rr["port_range"] = r.ranges
				rr["ip_cidr"] = r.ip
				if version > 0 {
					rr["ip_version"] = version
				}
				routes = append(routes, rr)
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
				routes = append(routes, r.xrRules(name, out, version)...)
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
				if e := addDNS(rs, name, detour, r); e != nil {
					return nil, e
				}
			}
		}
		if splitRule != nil {
			out := outTag(rs.str("dns_proxy_node"))
			if out == "" {
				return nil, fmt.Errorf("split rule %q requires a DNS exit", rs.str("name"))
			}
			if e := addDNS(rs, rs.str("name"), out, *splitRule); e != nil {
				return nil, e
			}
		}
	}
	if co == "xray" {
		d, e := dnsServer(co, dnsNodes[resolver], "default-dns", "")
		if e != nil {
			return nil, e
		}
		d["skipFallback"] = false
		servers = append(servers, d)
		for _, out := range exitOrder {
			dnsRules = append(dnsRules, object{"inboundTag": dnsExits[out], "outboundTag": out})
		}
		route["rules"] = append(dnsRules, routes...)
	} else {
		route["rules"] = routes
		route["rule_set"] = sets
		dns["rules"] = dnsRules
	}
	dns["servers"] = servers
	o := object{"log": logConfig(co, s.str("log_level")), "inbounds": []object{inbound(co, "tproxy", "tproxy-in", s.num("shunt_listen_port"), true), inbound(co, "direct", "dns-in", s.num("dns_listen_port"), true)}, "outbounds": outs, "dns": dns}
	if co == "xray" {
		o["routing"] = route
	} else {
		o["route"] = route
	}
	return o, nil
}
