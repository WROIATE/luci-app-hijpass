package generator

import (
	"errors"
	"fmt"

	"hijpass/config/config"
	"hijpass/config/core"
	"hijpass/config/proxy"
	"hijpass/config/routing"
)

type Generated struct {
	Nodes map[string]*core.Config `json:"nodes"`
	Shunt *core.Config            `json:"shunt,omitempty"`
}

func Render(c config.Snapshot) (Generated, error) {
	nodes := proxy.New(c)
	out := Generated{Nodes: map[string]*core.Config{}}
	if err := c.Validate(); err != nil {
		return out, err
	}
	if err := nodes.Validate(); err != nil {
		return out, err
	}
	for _, s := range c.Of("proxy_node") {
		if s.String("enabled") != "1" || s.String("type") == "custom" || proxy.CoreName(s) == "custom" {
			continue
		}
		o, err := nodes.Build(s)
		if err != nil {
			return out, fmt.Errorf("node %q: %w", s.String("name"), err)
		}
		out.Nodes[s.String(".name")] = o
	}
	s := c.First("shunt")
	if s.String("enabled") != "0" && s.String("config_type") == "tmpl" {
		o, err := routing.Build(c, nodes)
		if err != nil {
			return out, err
		}
		out.Shunt = o
	}
	return out, nil
}

// RenderTarget generates one preview without requiring other nodes to be enabled.
func RenderTarget(c config.Snapshot, target string) (*core.Config, error) {
	nodes := proxy.New(c)
	if err := c.Validate(); err != nil {
		return nil, err
	}
	if target == "shunt" {
		return routing.Build(c, nodes)
	}
	for _, s := range c.Of("proxy_node") {
		if s.String(".name") == target {
			return nodes.Build(s)
		}
	}
	return nil, errors.New("node not found")
}

// Validate checks the submitted configuration without requiring enabled services.
func Validate(c config.Snapshot) error {
	if err := c.Validate(); err != nil {
		return err
	}
	if c.First("hijpass").String("enabled") == "0" {
		return nil
	}
	_, err := Render(c)
	return err
}
