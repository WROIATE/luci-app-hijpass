package proxy

import (
	"fmt"

	"hijpass/config/config"
	"hijpass/config/core"
	"hijpass/config/core/singbox"
	"hijpass/config/core/xray"
	"hijpass/config/uci"
)

// Catalog resolves application node references and owns graph validation.
type Catalog struct{ sections config.Snapshot }

func New(sections config.Snapshot) *Catalog { return &Catalog{sections: sections} }

// Endpoint is the local SOCKS service consumed by routing and chained proxies.
type Endpoint struct {
	Name string
	Port uint16
}

func (c *Catalog) Endpoints() ([]Endpoint, error) {
	var out []Endpoint
	for _, s := range c.sections.Of("proxy_node") {
		if s.String("enabled") != "1" {
			continue
		}
		if err := uci.ValidatePort(s, "socks_port"); err != nil {
			return nil, err
		}
		out = append(out, Endpoint{Name: s.Value("name", s.String(".name")), Port: uint16(s.Number("socks_port"))})
	}
	return out, nil
}

func (c *Catalog) node(name string) (uci.Section, error) {
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
func (c *Catalog) Build(raw uci.Section) (*core.Config, error) {
	n, err := Decode(raw)
	if err != nil {
		return nil, err
	}
	switch n.Base().Core {
	case "sing-box":
		return singbox.Build(n, c.Port)
	case "xray":
		return xray.Build(n, c.Port)
	default:
		return nil, fmt.Errorf("unsupported core %q", n.Base().Core)
	}
}

func (c *Catalog) Port(name string) (uint16, error) {
	s, err := c.node(name)
	if err != nil {
		return 0, err
	}
	return uint16(s.Number("socks_port")), nil
}
func CoreName(s uci.Section) string {
	v := s.Value("core", "sing-box")
	if _, ok := s["core"]; !ok && s.String("type") == "vless" {
		v = "xray"
	}
	if v == "singbox" {
		v = "sing-box"
	}
	return v
}
