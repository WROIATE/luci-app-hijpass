package proxy

import (
	"testing"

	"hijpass/config/config"
	"hijpass/config/uci"
)

func TestDependencyValidation(t *testing.T) {
	base := uci.Section{".name": "a", ".type": "proxy_node", "name": "a", "enabled": "1", "type": "shadowsocks", "core": "sing-box", "listen_port": "10001", "socks_port": "10002"}
	for _, tc := range []struct {
		name     string
		other    uci.Section
		upstream string
	}{
		{"missing", nil, "missing"}, {"self", nil, "a"}, {"cycle", uci.Section{".name": "b", ".type": "proxy_node", "name": "b", "enabled": "1", "type": "shadowsocks", "listen_port": "10003", "socks_port": "10004", "upstream_proxy_node": "a"}, "b"},
		{"disabled", uci.Section{".name": "b", ".type": "proxy_node", "name": "b", "enabled": "0"}, "b"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := clone(base)
			s["upstream_proxy_node"] = tc.upstream
			c := config.Snapshot{s}
			if tc.other != nil {
				c = append(c, tc.other)
			}
			if e := New(c).Validate(); e == nil {
				t.Fatal("expected validation failure")
			}
		})
	}
}

func clone(s uci.Section) uci.Section {
	o := uci.Section{}
	for k, v := range s {
		o[k] = v
	}
	return o
}

func TestPortAliasesStillConflict(t *testing.T) {
	c := config.Snapshot{
		{".name": "a", ".type": "proxy_node", "enabled": "1", "name": "a", "type": "custom", "listen_port": "010001", "socks_port": "10002"},
		{".name": "b", ".type": "proxy_node", "enabled": "1", "name": "b", "type": "custom", "listen_port": "10001", "socks_port": "10003"},
	}
	if err := New(c).Validate(); err == nil {
		t.Fatal("same numeric port accepted twice")
	}
}
