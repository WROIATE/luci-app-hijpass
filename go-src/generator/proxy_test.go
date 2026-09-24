package generator

import (
	"reflect"
	"testing"

	"hijpass/config/generator/protocol"
	"hijpass/config/uci"
)

func TestProtocolSpecificDecoding(t *testing.T) {
	cases := []struct {
		protocol string
		want     protocol.Config
		stale    uci.Section
	}{
		{"shadowsocks", &protocol.Shadowsocks{}, uci.Section{"tls_insecure": "invalid", "transport_ws_max_early_data": "invalid", "strategy_expected": "invalid"}},
		{"hysteria2", &protocol.Hysteria2{}, uci.Section{"multiplex_max_connections": "invalid", "tls_reality_enabled": "invalid", "version": "invalid"}},
		{"tuic", &protocol.TUIC{}, uci.Section{"hop_interval": "invalid", "udp_over_tcp": "invalid", "tls_reality_enabled": "invalid"}},
		{"shadowtls", &protocol.ShadowTLS{}, uci.Section{"multiplex_enabled": "invalid", "tls_reality_enabled": "invalid", "heartbeat": "invalid"}},
		{"vless", &protocol.VLESS{}, uci.Section{"udp_over_tcp": "invalid", "up_mbps": "invalid", "strategy_tolerance": "invalid", "version": "invalid"}},
		{"load_balance", &protocol.LoadBalance{}, uci.Section{"server_port": "invalid", "tls_insecure": "invalid", "multiplex_enabled": "invalid"}},
	}
	for _, tc := range cases {
		t.Run(tc.protocol, func(t *testing.T) {
			s := uci.Section{".name": "node", "name": "node", "type": tc.protocol, "listen_port": "11001", "socks_port": "12001", "server": "example.org", "server_port": "443"}
			before, err := decodeProxy(s)
			if err != nil {
				t.Fatal(err)
			}
			if reflect.TypeOf(before) != reflect.TypeOf(tc.want) {
				t.Fatalf("got %T, want %T", before, tc.want)
			}
			for key, value := range tc.stale {
				s[key] = value
			}
			after, err := decodeProxy(s)
			if err != nil {
				t.Fatalf("unrelated protocol field affected decoding: %v", err)
			}
			if !reflect.DeepEqual(before, after) {
				t.Fatal("unrelated protocol fields changed the typed node")
			}
			_, remote := after.(protocol.RemoteConfig)
			if remote != (tc.protocol != "load_balance") {
				t.Fatal("only remote proxies should expose an endpoint")
			}
		})
	}
}

func TestProtocolSpecificValidation(t *testing.T) {
	for _, tc := range []struct{ protocol, key, value string }{
		{"shadowsocks", "multiplex_max_streams", "2147483648"},
		{"hysteria2", "up_mbps", "2147483648"},
		{"tuic", "heartbeat", "invalid"},
		{"shadowtls", "version", "2147483648"},
		{"vless", "tls_reality_enabled", "invalid"},
		{"load_balance", "tolerance", "65536"},
	} {
		t.Run(tc.protocol, func(t *testing.T) {
			s := uci.Section{"type": tc.protocol, "listen_port": "11001", "socks_port": "12001", "server": "example.org", "server_port": "443", tc.key: tc.value}
			if _, err := decodeProxy(s); err == nil {
				t.Fatalf("invalid %s accepted by %s", tc.key, tc.protocol)
			}
		})
	}
	if _, err := decodeProxy(uci.Section{"type": "unknown"}); err == nil {
		t.Fatal("unknown protocol accepted")
	}
}

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
			c := Snapshot{s}
			if tc.other != nil {
				c = append(c, tc.other)
			}
			if e := newProxyCatalog(c).Validate(); e == nil {
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
	c := Snapshot{
		{".name": "a", ".type": "proxy_node", "enabled": "1", "name": "a", "type": "custom", "listen_port": "010001", "socks_port": "10002"},
		{".name": "b", ".type": "proxy_node", "enabled": "1", "name": "b", "type": "custom", "listen_port": "10001", "socks_port": "10003"},
	}
	if err := newProxyCatalog(c).Validate(); err == nil {
		t.Fatal("same numeric port accepted twice")
	}
}
