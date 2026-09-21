package main

import (
	"fmt"
	"strconv"
)

type section map[string]any
type config []section

func (s section) str(k string) string { v, _ := s[k].(string); return v }
func (s section) val(k, fallback string) string {
	if v := s.str(k); v != "" {
		return v
	}
	return fallback
}
func (s section) list(k string) []string {
	var out []string
	switch v := s[k].(type) {
	case []any:
		for _, x := range v {
			if t, ok := x.(string); ok && t != "" {
				out = append(out, t)
			}
		}
	case []string:
		out = v
	case string:
		if v != "" {
			out = []string{v}
		}
	}
	return out
}
func (s section) num(k string) float64 { v, _ := strconv.ParseFloat(s.str(k), 64); return v }
func (c config) of(t string) config {
	var out config
	for _, s := range c {
		if s.str(".type") == t {
			out = append(out, s)
		}
	}
	return out
}
func (c config) first(t string) section {
	for _, s := range c {
		if s.str(".type") == t {
			return s
		}
	}
	return section{}
}
func core(s section) string {
	v := s.val("core", "sing-box")
	if _, ok := s["core"]; !ok && s.str("type") == "vless" {
		v = "xray"
	}
	if v == "singbox" {
		v = "sing-box"
	}
	return v
}
func port(s section, k string) error {
	n, err := strconv.Atoi(s.str(k))
	if err != nil || n < 1 || n > 65535 {
		return fmt.Errorf("%s: invalid %s", s.val("name", s.str(".name")), k)
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
