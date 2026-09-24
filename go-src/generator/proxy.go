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
type proxyCatalog struct{ sections Snapshot }

func newProxyCatalog(sections Snapshot) *proxyCatalog { return &proxyCatalog{sections: sections} }

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
	for _, s := range c.sections.Of("proxy_node") {
		if s.Value("name", s.String(".name")) == name && s.String("enabled") == "1" {
			if err := uci.ValidatePort(s, "socks_port"); err != nil {
				return nil, err
			}
			return s, nil
		}
	}
	return nil, fmt.Errorf("proxy node %q missing or disabled", name)
}
func (c *proxyCatalog) Build(raw uci.Section) (*Output, error) {
	n, err := decodeProxy(raw)
	if err != nil {
		return nil, err
	}
	switch n.Base().Core {
	case "sing-box":
		options, err := singbox.Build(n, c.Port)
		return &Output{SingBox: options}, err
	case "xray":
		options, err := xray.Build(n, c.Port)
		return &Output{Xray: options}, err
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
	n, err := protocol.Decode(data)
	if err != nil {
		return nil, err
	}
	n.Base().Core = coreName(s)
	return n, nil
}
