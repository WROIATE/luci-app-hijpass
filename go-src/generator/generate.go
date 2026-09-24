package generator

import (
	"encoding/json"
	"errors"
	"fmt"
)

type Generated struct {
	Nodes map[string]json.Marshaler `json:"nodes"`
	Shunt json.Marshaler            `json:"shunt,omitempty"`
}

func Render(c Snapshot) (Generated, error) {
	nodes := newProxyCatalog(c)
	out := Generated{Nodes: map[string]json.Marshaler{}}
	if err := c.Validate(); err != nil {
		return out, err
	}
	if err := nodes.Validate(); err != nil {
		return out, err
	}
	for _, s := range c.Of("proxy_node") {
		if s.String("enabled") != "1" || s.String("type") == "custom" || coreName(s) == "custom" {
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
		o, err := buildRouting(c, nodes)
		if err != nil {
			return out, err
		}
		out.Shunt = o
	}
	return out, nil
}

// RenderTarget generates one preview without requiring other nodes to be enabled.
func RenderTarget(c Snapshot, target string) (json.Marshaler, error) {
	nodes := newProxyCatalog(c)
	if err := c.Validate(); err != nil {
		return nil, err
	}
	if target == "shunt" {
		return buildRouting(c, nodes)
	}
	for _, s := range c.Of("proxy_node") {
		if s.String(".name") == target {
			return nodes.Build(s)
		}
	}
	return nil, errors.New("node not found")
}

// Validate checks the submitted configuration without requiring enabled services.
func Validate(c Snapshot) error {
	if err := c.Validate(); err != nil {
		return err
	}
	if c.First("hijpass").String("enabled") == "0" {
		return nil
	}
	_, err := Render(c)
	return err
}
