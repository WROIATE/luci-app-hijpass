package generator

import (
	"encoding/json"
	"fmt"

	"hijpass/config/generator/protocol"
	"hijpass/config/generator/singbox"
	"hijpass/config/generator/xray"
	"hijpass/config/uci"
)

// buildProxy converts one prepared protocol object to its native core config.
func buildProxy(n protocol.Config) (json.Marshaler, error) {
	switch n.Base().Core {
	case "sing-box":
		options, err := singbox.Build(n)
		if err != nil {
			return nil, err
		}
		return (*SingBoxConfig)(options), nil
	case "xray":
		options, err := xray.Build(n)
		if err != nil {
			return nil, err
		}
		return (*XrayConfig)(options), nil
	default:
		return nil, fmt.Errorf("unsupported core %q", n.Base().Core)
	}
}

func coreName(s uci.Section) string {
	v := s.Value("core", "sing-box")
	if _, ok := s["core"]; !ok && s.String("type") == "vless" {
		v = "xray"
	}
	if v == "singbox" {
		v = "sing-box"
	}
	return v
}

// Adapt raw UCI sections to the protocol package without coupling its models to
// the application's section lookup or core-name normalization.
func decodeProxy(s uci.Section) (protocol.Config, error) {
	core := coreName(s)
	switch core {
	case "sing-box", "xray", "custom":
	default:
		return nil, fmt.Errorf("unsupported core %q", core)
	}
	data, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	if core == "custom" {
		d, err := uci.NewDecoder(data)
		if err != nil {
			return nil, err
		}
		n := &protocol.Custom{}
		if err := n.DecodeUCI(d); err != nil {
			return nil, err
		}
		if err := protocol.Validate(n); err != nil {
			return nil, err
		}
		n.Core = "custom"
		n.Name = s.Value("name", s.String(".name"))
		return n, nil
	}
	n, err := protocol.Decode(data)
	if err != nil {
		return nil, err
	}
	n.Base().Core = core
	n.Base().Name = s.Value("name", s.String(".name"))
	return n, nil
}

// resolveProxies decodes the selected roots and their enabled dependencies, then
// connects object references. All state is local to this preparation pass.
func resolveProxies(sections Snapshot, roots Snapshot) ([]protocol.Config, error) {
	byName := make(map[string][]uci.Section)
	for _, s := range sections {
		if s.String("enabled") == "1" {
			name := s.Value("name", s.String(".name"))
			byName[name] = append(byName[name], s)
		}
	}
	byID := make(map[string]protocol.Config)
	var nodes []protocol.Config
	pending := append(Snapshot(nil), roots...)
	references := make(map[string][]string)
	for i := 0; i < len(pending); i++ {
		s := pending[i]
		id := s.String(".name")
		if byID[id] != nil {
			continue
		}
		name := s.Value("name", id)
		for _, other := range byName[name] {
			if other.String(".name") != id {
				return nil, fmt.Errorf("duplicate proxy name %q", name)
			}
		}
		n, err := decodeProxy(s)
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", name, err)
		}
		byID[id] = n
		nodes = append(nodes, n)
		refs, err := proxyReferences(s, n)
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", name, err)
		}
		for _, ref := range refs {
			matches := byName[ref]
			if len(matches) == 0 {
				return nil, fmt.Errorf("proxy node %q missing or disabled", ref)
			}
			if len(matches) > 1 {
				return nil, fmt.Errorf("duplicate proxy name %q", ref)
			}
			target := matches[0]
			references[id] = append(references[id], target.String(".name"))
			pending = append(pending, target)
		}
	}
	for _, n := range nodes {
		refs := references[n.Base().ID]
		switch n := n.(type) {
		case *protocol.LoadBalance:
			for _, id := range refs {
				n.Members = append(n.Members, byID[id])
			}
		case *protocol.Custom:
			if len(refs) > 0 {
				n.Upstream = byID[refs[0]]
			}
		case protocol.RemoteConfig:
			if len(refs) > 0 {
				n.Endpoint().Upstream = byID[refs[0]]
			}
		}
	}
	return nodes, nil
}

// Reference names belong to application configuration, not protocol fields.
func proxyReferences(s uci.Section, n protocol.Config) ([]string, error) {
	data, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	d, err := uci.NewDecoder(data)
	if err != nil {
		return nil, err
	}
	var upstream string
	d.Text("upstream_proxy_node", &upstream)
	var refs []string
	if _, loadBalance := n.(*protocol.LoadBalance); loadBalance {
		d.List("member_node", &refs)
		if upstream != "" {
			return nil, fmt.Errorf("load balancing node cannot have an upstream: %s", n.Base().Name)
		}
	} else if upstream != "" {
		refs = []string{upstream}
	}
	return refs, d.Err()
}
