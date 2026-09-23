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
func (c config) proxy(raw section) (*coreConfig, error) {
	n, err := parseNode(raw)
	if err != nil {
		return nil, err
	}
	switch n.base().Core {
	case "sing-box":
		return c.singboxProxy(n)
	case "xray":
		return c.xrayProxy(n)
	default:
		return nil, fmt.Errorf("unsupported core %q", n.base().Core)
	}
}
