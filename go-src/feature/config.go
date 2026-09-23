package feature

import (
	"fmt"
	"hijpass/config/uci"
	"strconv"
)

type Config []uci.Section

func (c Config) Of(t string) Config {
	var out Config
	for _, s := range c {
		if s.String(".type") == t {
			out = append(out, s)
		}
	}
	return out
}
func (c Config) First(t string) uci.Section {
	for _, s := range c {
		if s.String(".type") == t {
			return s
		}
	}
	return uci.Section{}
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
func port(s uci.Section, k string) error {
	n, err := strconv.Atoi(s.String(k))
	if err != nil || n < 1 || n > 65535 {
		return fmt.Errorf("%s: invalid %s", s.Value("name", s.String(".name")), k)
	}
	return nil
}
func outTag(s string) string {
	switch s {
	case "hijpass-direct":
		return "direct-out"
	case "hijpass-block":
		return "block"
	}
	return s
}
