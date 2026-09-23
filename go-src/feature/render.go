package feature

import (
	"errors"
	"fmt"
	"hijpass/config/core"
)

type Generated struct {
	Nodes map[string]*core.Config `json:"nodes"`
	Shunt *core.Config            `json:"shunt,omitempty"`
}

func Validate(c Config) error {
	if len(c) == 0 {
		return errors.New("configuration is empty")
	}
	ids := map[string]bool{}
	for _, s := range c {
		if s == nil || s.String(".name") == "" || s.String(".type") == "" {
			return errors.New("section requires .name and .type")
		}
		if ids[s.String(".name")] {
			return fmt.Errorf("duplicate section %q", s.String(".name"))
		}
		ids[s.String(".name")] = true
		for k, v := range s {
			if len(k) > 0 && k[0] == '.' {
				continue
			}
			switch x := v.(type) {
			case string:
			case []any:
				for _, item := range x {
					if _, ok := item.(string); !ok {
						return fmt.Errorf("%s: %s must be a string list", s.String(".name"), k)
					}
				}
			default:
				return fmt.Errorf("%s: %s must be a string or string list", s.String(".name"), k)
			}
		}
	}
	return nil
}
func Render(c Config) (Generated, error) {
	out := Generated{Nodes: map[string]*core.Config{}}
	if err := Validate(c); err != nil {
		return out, err
	}
	if err := c.validateDependencies(); err != nil {
		return out, err
	}
	for _, s := range c.Of("proxy_node") {
		if s.String("enabled") != "1" || s.String("type") == "custom" || CoreName(s) == "custom" {
			continue
		}
		o, err := c.Proxy(s)
		if err != nil {
			return out, fmt.Errorf("node %q: %w", s.String("name"), err)
		}
		out.Nodes[s.String(".name")] = o
	}
	s := c.First("shunt")
	if s.String("enabled") != "0" && s.String("config_type") == "tmpl" {
		o, err := c.Shunt()
		if err != nil {
			return out, err
		}
		out.Shunt = o
	}
	return out, nil
}
