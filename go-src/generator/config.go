package generator

import (
	"errors"
	"fmt"

	"hijpass/config/uci"
	"hijpass/config/uci/constant"
)

type Snapshot []uci.Section

const (
	sectionProxyNode      = "proxy_node"
	sectionShunt          = "shunt"
	sectionShuntDNSNode   = "shunt_dns_node"
	sectionShuntRouteRule = "shunt_route_rule"
	sectionService        = "hijpass"
	configTypeTemplate    = "tmpl"
)

func (c Snapshot) Of(t string) Snapshot {
	var out Snapshot
	for _, s := range c {
		if s.String(constant.SectionType) == t {
			out = append(out, s)
		}
	}
	return out
}
func (c Snapshot) First(t string) uci.Section {
	for _, s := range c {
		if s.String(constant.SectionType) == t {
			return s
		}
	}
	return uci.Section{}
}
func (c Snapshot) Validate() error {
	if len(c) == 0 {
		return errors.New("configuration is empty")
	}
	ids := map[string]bool{}
	for _, s := range c {
		if s == nil || s.String(constant.SectionName) == "" || s.String(constant.SectionType) == "" {
			return errors.New("section requires .name and .type")
		}
		if ids[s.String(constant.SectionName)] {
			return fmt.Errorf("duplicate section %q", s.String(constant.SectionName))
		}
		ids[s.String(constant.SectionName)] = true
		for k, v := range s {
			if len(k) > 0 && k[0] == '.' {
				continue
			}
			switch x := v.(type) {
			case string, []string:
			case []any:
				for _, item := range x {
					if _, ok := item.(string); !ok {
						return fmt.Errorf("%s: %s must be a string list", s.String(constant.SectionName), k)
					}
				}
			default:
				return fmt.Errorf("%s: %s must be a string or string list", s.String(constant.SectionName), k)
			}
		}
	}
	return nil
}
