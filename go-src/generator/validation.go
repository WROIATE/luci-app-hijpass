package generator

import (
	"fmt"
	"strconv"

	"hijpass/config/generator/protocol"
	"hijpass/config/uci"
)

func (c *proxyCatalog) Validate() error {
	names := map[string]bool{}
	ports := map[string]string{}
	for _, s := range c.sections.Of("proxy_node") {
		if s.String("enabled") != "1" {
			continue
		}
		name := s.Value("name", s.String(".name"))
		if names[name] {
			return fmt.Errorf("duplicate proxy name %q", name)
		}
		names[name] = true
		for _, k := range []string{"listen_port", "socks_port"} {
			if err := uci.ValidatePort(s, k); err != nil {
				return err
			}
			p := strconv.Itoa(int(s.Number(k)))
			if owner, ok := ports[p]; ok {
				return fmt.Errorf("port %s is shared by %s and %s", p, owner, name)
			}
			ports[p] = name
		}
	}
	for name := range names {
		s, err := c.node(name)
		if err != nil {
			return err
		}
		if _, err := c.resolve(s); err != nil {
			return err
		}
	}
	return nil
}

// Reject invalid ports before conversion to the native uint16 representation.
func validateRulePorts(s uci.Section) error {
	for _, p := range s.List("port") {
		n, e := strconv.Atoi(p)
		if e != nil || n < 1 || n > 65535 {
			return fmt.Errorf("invalid rule port %q", p)
		}
	}
	return nil
}

// Traverse object references. Completed nodes retain their chain height so a
// shared upstream is checked against every incoming path's depth.
func validateDependencies(root protocol.Config) error {
	active := map[protocol.Config]bool{}
	heights := map[protocol.Config]int{}
	var visit func(protocol.Config) (int, error)
	visit = func(n protocol.Config) (int, error) {
		name := n.Base().Name
		if active[n] {
			return 0, fmt.Errorf("proxy dependency cycle at %q", name)
		}
		if h, ok := heights[n]; ok {
			return h, nil
		}
		active[n] = true
		height := 1
		var upstream protocol.Config
		switch n := n.(type) {
		case *protocol.LoadBalance:
			if len(n.Members) == 0 {
				return 0, fmt.Errorf("load balancing node %q has no members", name)
			}
			unique := map[string]bool{}
			for _, member := range n.Members {
				memberName := member.Base().Name
				if unique[memberName] {
					return 0, fmt.Errorf("duplicate load balancing member %q", memberName)
				}
				unique[memberName] = true
				if _, nested := member.(*protocol.LoadBalance); nested {
					return 0, fmt.Errorf("nested load balancing member %q", memberName)
				}
				if _, err := visit(member); err != nil {
					return 0, err
				}
			}
			if n.Fallback != "" && !unique[n.Fallback] {
				return 0, fmt.Errorf("fallback %q is not a load balancing member", n.Fallback)
			}
		case protocol.RemoteConfig:
			upstream = n.Endpoint().Upstream
		case *protocol.Custom:
			upstream = n.Upstream
		}
		if upstream != nil {
			h, err := visit(upstream)
			if err != nil {
				return 0, err
			}
			height += h
		}
		if height > 3 {
			return 0, fmt.Errorf("proxy chain exceeds three nodes at %q", name)
		}
		delete(active, n)
		heights[n] = height
		return height, nil
	}
	_, err := visit(root)
	return err
}
