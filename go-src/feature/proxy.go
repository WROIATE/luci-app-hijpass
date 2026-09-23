package feature

import (
	"fmt"
	"hijpass/config/core"
	"hijpass/config/core/singbox"
	"hijpass/config/core/xray"
	"hijpass/config/uci"
)

func (c Config) node(name string) (uci.Section, error) {
	for _, s := range c.Of("proxy_node") {
		if s.Value("name", s.String(".name")) == name && s.String("enabled") == "1" {
			if err := port(s, "socks_port"); err != nil {
				return nil, err
			}
			return s, nil
		}
	}
	return nil, fmt.Errorf("proxy node %q missing or disabled", name)
}
func (c Config) validateDependencies() error {
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
		deps := s.List("upstream_proxy_node")
		if s.String("type") == "load_balance" {
			if len(deps) > 0 {
				return fmt.Errorf("load balancing node cannot have an upstream: %s", name)
			}
			deps = s.List("member_node")
			unique := map[string]bool{}
			for _, member := range deps {
				if unique[member] {
					return fmt.Errorf("duplicate load balancing member %q", member)
				}
				unique[member] = true
			}
			if fallback := s.String("fallback_tag"); fallback != "" && !unique[fallback] {
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
			if s.String("type") == "load_balance" && m.String("type") == "load_balance" {
				return fmt.Errorf("nested load balancing member %q", d)
			}
			nextDepth := depth + 1
			if s.String("type") == "load_balance" {
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
	for _, s := range c.Of("proxy_node") {
		if s.String("enabled") != "1" {
			continue
		}
		name := s.Value("name", s.String(".name"))
		if names[name] {
			return fmt.Errorf("duplicate proxy name %q", name)
		}
		names[name] = true
		for _, k := range []string{"listen_port", "socks_port"} {
			if err := port(s, k); err != nil {
				return err
			}
			p := s.String(k)
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
func (c Config) Proxy(raw uci.Section) (*core.Config, error) {
	n, err := parseNode(raw)
	if err != nil {
		return nil, err
	}
	switch n.Base().Core {
	case "sing-box":
		return singbox.Build(n, c.nodePort)
	case "xray":
		return xray.Build(n, c.nodePort)
	default:
		return nil, fmt.Errorf("unsupported core %q", n.Base().Core)
	}
}

func (c Config) nodePort(name string) (uint16, error) {
	s, err := c.node(name)
	if err != nil {
		return 0, err
	}
	return uint16(s.Number("socks_port")), nil
}
