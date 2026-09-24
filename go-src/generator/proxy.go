package generator

import (
	"encoding/json"
	"fmt"

	"hijpass/config/generator/protocol"
	"hijpass/config/generator/singbox"
	"hijpass/config/generator/xray"
	"hijpass/config/uci"
)

// proxyCatalog resolves application node references and owns graph validation.
type proxyCatalog struct {
	sections Snapshot
	byName   map[string]uci.Section
	resolved map[string]protocol.Config
}

func newProxyCatalog(sections Snapshot) *proxyCatalog {
	c := &proxyCatalog{sections: sections, byName: make(map[string]uci.Section)}
	for _, s := range sections.Of("proxy_node") {
		if s.String("enabled") == "1" {
			name := s.Value("name", s.String(".name"))
			if c.byName[name] == nil {
				c.byName[name] = s
			}
		}
	}
	return c
}

func (c *proxyCatalog) names() []string {
	var names []string
	for _, s := range c.sections.Of("proxy_node") {
		if s.String("enabled") == "1" {
			names = append(names, s.Value("name", s.String(".name")))
		}
	}
	return names
}

func (c *proxyCatalog) node(name string) (uci.Section, error) {
	if s := c.byName[name]; s != nil {
		if err := uci.ValidatePort(s, "socks_port"); err != nil {
			return nil, err
		}
		return s, nil
	}
	return nil, fmt.Errorf("proxy node %q missing or disabled", name)
}
func (c *proxyCatalog) Build(raw uci.Section) (json.Marshaler, error) {
	n, err := c.resolve(raw)
	if err != nil {
		return nil, err
	}
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

func (c *proxyCatalog) Port(name string) (uint16, error) {
	s, err := c.node(name)
	if err != nil {
		return 0, err
	}
	return uint16(s.Number("socks_port")), nil
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
	data, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	if coreName(s) == "custom" {
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
	n.Base().Core = coreName(s)
	n.Base().Name = s.Value("name", s.String(".name"))
	return n, nil
}

// resolve decodes each reachable node once, then links references in a second pass.
// Only successful graphs are cached; previews need not decode unrelated nodes.
func (c *proxyCatalog) resolve(root uci.Section) (protocol.Config, error) {
	id := root.String(".name")
	if n := c.resolved[id]; n != nil {
		return n, nil
	}
	nodes := make(map[string]protocol.Config)
	for key, n := range c.resolved {
		nodes[key] = n
	}
	var decoded []uci.Section
	sections := []uci.Section{root}
	references := make(map[string][]string)
	for i := 0; i < len(sections); i++ {
		s := sections[i]
		key := s.String(".name")
		if nodes[key] != nil {
			continue
		}
		n, err := decodeProxy(s)
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", s.Value("name", key), err)
		}
		nodes[key] = n
		decoded = append(decoded, s)
		data, err := json.Marshal(s)
		if err != nil {
			return nil, err
		}
		d, err := uci.NewDecoder(data)
		if err != nil {
			return nil, err
		}
		var refs []string
		switch n.(type) {
		case *protocol.LoadBalance:
			var upstream string
			d.Text("upstream_proxy_node", &upstream)
			if upstream != "" {
				return nil, fmt.Errorf("load balancing node cannot have an upstream: %s", n.Base().Name)
			}
			d.List("member_node", &refs)
		case protocol.RemoteConfig, *protocol.Custom:
			var upstream string
			d.Text("upstream_proxy_node", &upstream)
			if upstream != "" {
				refs = []string{upstream}
			}
		}
		if err := d.Err(); err != nil {
			return nil, err
		}
		for _, name := range refs {
			target, err := c.node(name)
			if err != nil {
				return nil, err
			}
			references[key] = append(references[key], target.String(".name"))
			sections = append(sections, target)
		}
	}
	for _, s := range decoded {
		key := s.String(".name")
		n := nodes[key]
		switch n := n.(type) {
		case *protocol.LoadBalance:
			n.Members = nil
			for _, target := range references[key] {
				n.Members = append(n.Members, nodes[target])
			}
		case *protocol.Custom:
			if refs := references[key]; len(refs) > 0 {
				n.Upstream = nodes[refs[0]]
			}
		case protocol.RemoteConfig:
			if refs := references[key]; len(refs) > 0 {
				n.Endpoint().Upstream = nodes[refs[0]]
			}
		}
	}
	if err := validateDependencies(nodes[id]); err != nil {
		return nil, err
	}
	if c.resolved == nil {
		c.resolved = make(map[string]protocol.Config)
	}
	for key, n := range nodes {
		c.resolved[key] = n
	}
	return nodes[id], nil
}
