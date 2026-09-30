package generator

import (
	"fmt"

	"hijpass/config/uci"
	"hijpass/config/uci/constant"
	"hijpass/config/uci/protocol"
)

// Port ranges were checked during decoding. Only cross-field conflicts remain.
func validateListenPorts(nodes []protocol.Config, shunt *routingSettings) error {
	owners := make(map[uint16]string)
	add := func(port uint16, owner string) error {
		if previous, exists := owners[port]; exists {
			return fmt.Errorf("port %d is shared by %s and %s", port, previous, owner)
		}
		owners[port] = owner
		return nil
	}
	for _, n := range nodes {
		base := n.Base()
		if err := add(base.ListenPort, base.Name+"."+constant.OptionListenPort); err != nil {
			return err
		}
		if err := add(base.SocksPort, base.Name+"."+constant.OptionSocksPort); err != nil {
			return err
		}
	}
	if shunt != nil {
		if err := add(shunt.ListenPort, sectionShunt+"."+constant.OptionShuntListenPort); err != nil {
			return err
		}
		if err := add(shunt.DNSPort, sectionShunt+"."+constant.OptionDNSListenPort); err != nil {
			return err
		}
	}
	return nil
}

// Reject invalid rule ports before converting them to native rule options.
func validateRulePorts(s uci.Section) error {
	for _, p := range s.List(constant.OptionPort) {
		if _, err := uci.ParsePort(p); err != nil {
			return fmt.Errorf("invalid rule port %q", p)
		}
	}
	return nil
}

// Traverse object references. Completed nodes retain their chain height so a
// shared upstream is checked against every incoming path's depth.
func validateDependencies(roots ...protocol.Config) error {
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
	for _, root := range roots {
		if _, err := visit(root); err != nil {
			return err
		}
	}
	return nil
}
