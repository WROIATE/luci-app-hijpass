package main

import "fmt"

func (c config) node(name string) (section, error) {
	for _, s := range c.of("proxy_node") {
		if s.val("name", s.str(".name")) == name && s.str("enabled") == "1" {
			if err := port(s, "socks_port"); err != nil {
				return nil, err
			}
			return s, nil
		}
	}
	return nil, fmt.Errorf("proxy node %q missing or disabled", name)
}
func (c config) validateDependencies() error {
	seen := map[string]bool{}
	active := map[string]bool{}
	var visit func(string, int) error
	visit = func(name string, depth int) error {
		if active[name] {
			return fmt.Errorf("proxy dependency cycle at %q", name)
		}
		if depth > 3 {
			return fmt.Errorf("proxy chain exceeds three nodes at %q", name)
		}
		if seen[name] && depth == 1 {
			return nil
		}
		s, e := c.node(name)
		if e != nil {
			return e
		}
		active[name] = true
		deps := s.list("upstream_proxy_node")
		if s.str("type") == "load_balance" {
			if len(deps) > 0 {
				return fmt.Errorf("load balancing node cannot have an upstream: %s", name)
			}
			deps = s.list("member_node")
			unique := map[string]bool{}
			for _, member := range deps {
				if unique[member] {
					return fmt.Errorf("duplicate load balancing member %q", member)
				}
				unique[member] = true
			}
			if fallback := s.str("fallback_tag"); fallback != "" && !unique[fallback] {
				return fmt.Errorf("fallback %q is not a load balancing member", fallback)
			}
			if len(deps) == 0 {
				return fmt.Errorf("load balancing node %q has no members", name)
			}
		}
		for _, d := range deps {
			m, e := c.node(d)
			if e != nil {
				return e
			}
			if s.str("type") == "load_balance" && m.str("type") == "load_balance" {
				return fmt.Errorf("nested load balancing member %q", d)
			}
			nextDepth := depth + 1
			if s.str("type") == "load_balance" {
				nextDepth = 1
			}
			if e = visit(d, nextDepth); e != nil {
				return e
			}
		}
		active[name] = false
		seen[name] = true
		return nil
	}
	names := map[string]bool{}
	ports := map[string]string{}
	for _, s := range c.of("proxy_node") {
		if s.str("enabled") != "1" {
			continue
		}
		name := s.val("name", s.str(".name"))
		if names[name] {
			return fmt.Errorf("duplicate proxy name %q", name)
		}
		names[name] = true
		for _, k := range []string{"listen_port", "socks_port"} {
			if err := port(s, k); err != nil {
				return err
			}
			p := s.str(k)
			if owner, ok := ports[p]; ok {
				return fmt.Errorf("port %s is shared by %s and %s", p, owner, name)
			}
			ports[p] = name
		}
	}
	for name := range names {
		if err := visit(name, 1); err != nil {
			return err
		}
	}
	return nil
}
func (c config) proxy(raw section) (object, error) {
	s := defaults(raw)
	co := core(s)
	o := object{"log": logConfig(co, s.str("log_level")), "inbounds": []object{inbound(co, "tproxy", "tproxy-in", s.num("listen_port"), false), inbound(co, "socks", "socks-in", s.num("socks_port"), false)}}
	if co == "sing-box" {
		o["dns"] = object{"servers": []object{{"type": "local", "tag": "local"}}}
	} else if co != "xray" {
		return nil, fmt.Errorf("unsupported core %q", co)
	}
	if s.str("type") == "load_balance" {
		var outs []object
		var tags []string
		fallback := "lb-member-0"
		for i, name := range s.list("member_node") {
			m, e := c.node(name)
			if e != nil {
				return nil, e
			}
			tag := fmt.Sprintf("lb-member-%d", i)
			tags = append(tags, tag)
			outs = append(outs, socks(co, tag, m.num("socks_port")))
			if name == s.str("fallback_tag") {
				fallback = tag
			}
		}
		if co == "sing-box" {
			lb := object{"type": "urltest", "tag": "slb", "outbounds": tags}
			fields(lb, s, "", "url", "interval", "idle_timeout")
			numbers(lb, s, "", "tolerance")
			flags(lb, s, "", "interrupt_exist_connections")
			o["outbounds"] = append([]object{lb}, outs...)
			o["route"] = object{"final": "slb"}
		} else {
			strategy := object{"type": s.val("strategy", "leastLoad")}
			if strategy["type"] == "leastLoad" {
				settings := object{"expected": 1, "maxRTT": s.val("strategy_max_rtt", "1s"), "tolerance": 0.05}
				if s.str("strategy_expected") != "" {
					settings["expected"] = s.num("strategy_expected")
				}
				if s.str("strategy_tolerance") != "" {
					settings["tolerance"] = s.num("strategy_tolerance")
				}
				strategy["settings"] = settings
			}
			ping := object{"destination": s.val("probe_url", "https://connectivitycheck.gstatic.com/generate_204"), "connectivity": s.str("probe_connectivity"), "interval": s.val("probe_interval", "60s"), "timeout": s.val("probe_timeout", "2s"), "sampling": 3, "httpMethod": s.str("probe_http_method")}
			if s.num("probe_sampling") != 0 {
				ping["sampling"] = s.num("probe_sampling")
			}
			o["outbounds"] = outs
			o["routing"] = object{"domainStrategy": "AsIs", "rules": []object{{"inboundTag": []string{"tproxy-in", "socks-in"}, "balancerTag": "slb"}}, "balancers": []object{{"tag": "slb", "selector": []string{"lb-member-"}, "fallbackTag": fallback, "strategy": strategy}}}
			o["burstObservatory"] = object{"subjectSelector": []string{"lb-member-"}, "pingConfig": ping}
		}
		return o, nil
	}
	if err := port(s, "server_port"); err != nil {
		return nil, err
	}
	if s.str("server") == "" {
		return nil, fmt.Errorf("node %q has no server", s.str("name"))
	}
	out, e := protocol(s)
	if e != nil {
		return nil, e
	}
	outs := []object{out}
	if name := s.str("upstream_proxy_node"); name != "" {
		up, e := c.node(name)
		if e != nil {
			return nil, e
		}
		tag := "upstream-" + name
		if co == "sing-box" {
			out["detour"] = tag
		} else {
			st, ok := out["streamSettings"].(object)
			if !ok {
				st = object{}
				out["streamSettings"] = st
			}
			st["sockopt"] = object{"dialerProxy": tag, "domainStrategy": "UseIP"}
		}
		outs = append(outs, socks(co, tag, up.num("socks_port")))
	}
	o["outbounds"] = outs
	return o, nil
}
