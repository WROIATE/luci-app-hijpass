package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type object map[string]any
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
func clone(s section) section {
	o := section{}
	for k, v := range s {
		o[k] = v
	}
	return o
}
func copyObj(s object) object {
	o := object{}
	for k, v := range s {
		o[k] = v
	}
	return o
}
func fields(o object, s section, prefix string, keys ...string) {
	for _, k := range keys {
		if v := s.str(prefix + k); v != "" {
			o[k] = v
		}
	}
}
func numbers(o object, s section, prefix string, keys ...string) {
	for _, k := range keys {
		if s.str(prefix+k) != "" {
			o[k] = s.num(prefix + k)
		}
	}
}
func flags(o object, s section, prefix string, keys ...string) {
	for _, k := range keys {
		if s.str(prefix+k) == "1" {
			o[k] = true
		}
	}
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
func defaults(s section) section {
	s = clone(s)
	d := section{"multiplex_protocol": "h2mux"}
	switch s.str("type") {
	case "tuic":
		d["congestion_control"] = "cubic"
		d["heartbeat"] = "10s"
	case "shadowtls":
		d["version"] = "1"
	case "vless":
		d["network"] = "tcp"
		for _, k := range []string{"transport_http_idle_timeout", "transport_http_ping_timeout", "transport_grpc_idle_timeout", "transport_grpc_ping_timeout"} {
			d[k] = "15s"
		}
	}
	for k, v := range d {
		if _, ok := s[k]; !ok {
			s[k] = v
		}
	}
	return s
}
func clean(v any) any {
	switch x := v.(type) {
	case object:
		o := object{}
		for k, v := range x {
			if n := clean(v); n != nil {
				o[k] = n
			}
		}
		return o
	case []object:
		var out []any
		for _, v := range x {
			out = append(out, clean(v))
		}
		if len(out) > 0 {
			return out
		}
		return nil
	case []string:
		if len(x) == 0 {
			return nil
		}
	case []int:
		if len(x) == 0 {
			return nil
		}
	case string:
		if strings.TrimSpace(x) == "" {
			return nil
		}
	}
	return v
}
func encode(v any) ([]byte, error) { return json.MarshalIndent(clean(v), "", "  ") }
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
func logConfig(co, level string) object {
	if level == "" {
		level = "info"
	}
	if co == "xray" {
		if level == "warn" {
			level = "warning"
		}
		return object{"loglevel": level, "dnsLog": false}
	}
	return object{"disabled": false, "level": level, "timestamp": true}
}
func socks(co, tag string, p float64) object {
	if co == "xray" {
		return object{"protocol": "socks", "tag": tag, "settings": object{"address": "127.0.0.1", "port": p}}
	}
	return object{"type": "socks", "tag": tag, "server": "127.0.0.1", "server_port": p, "version": "5"}
}
func inbound(co, kind, tag string, p float64, shunt bool) object {
	if co != "xray" {
		addr := "127.0.0.1"
		if shunt {
			addr = "::"
		}
		return object{"type": kind, "tag": tag, "listen": addr, "listen_port": p}
	}
	o := object{"protocol": "dokodemo-door", "tag": tag, "port": p, "settings": object{"network": "tcp,udp"}}
	if kind == "tproxy" {
		o["settings"] = object{"network": "tcp,udp", "followRedirect": true}
		o["streamSettings"] = object{"sockopt": object{"tproxy": "tproxy"}}
		if shunt {
			o["sniffing"] = object{"enabled": true, "destOverride": []string{"http", "tls", "quic"}, "routeOnly": true}
		}
	} else if kind == "socks" {
		o["protocol"] = "socks"
		o["settings"] = object{"udp": true}
	} else {
		o["listen"] = "::"
	}
	return o
}
