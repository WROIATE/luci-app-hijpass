package generator

import (
	"fmt"
	"reflect"
	"strings"
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
	base := graphNode("a", 10001)
	for _, tc := range []struct {
		name     string
		other    uci.Section
		upstream string
	}{
		{"missing", nil, "missing"}, {"self", nil, "a"}, {"cycle", uci.Section{".name": "b", ".type": "proxy_node", "name": "b", "enabled": "1", "type": "shadowsocks", "listen_port": "10003", "socks_port": "10004", "server": "example.org", "server_port": "443", "upstream_proxy_node": "a"}, "b"},
		{"disabled", uci.Section{".name": "b", ".type": "proxy_node", "name": "b", "enabled": "0"}, "b"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := clone(base)
			s["upstream_proxy_node"] = tc.upstream
			c := Snapshot{s}
			if tc.other != nil {
				c = append(c, tc.other)
			}
			if _, e := prepare(c, ""); e == nil {
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
	if _, err := prepare(c, ""); err == nil {
		t.Fatal("same numeric port accepted twice")
	}
}

func graphNode(name string, port int) uci.Section {
	return uci.Section{".name": name, ".type": "proxy_node", "name": name, "enabled": "1", "type": "shadowsocks", "core": "sing-box", "listen_port": fmt.Sprint(port), "socks_port": fmt.Sprint(port + 1), "server": "example.org", "server_port": "443"}
}

func TestResolvedReferences(t *testing.T) {
	a, b, c := graphNode("a", 10001), graphNode("b", 10003), graphNode("c", 10005)
	a["upstream_proxy_node"], b["upstream_proxy_node"] = "c", "c"
	lb := graphNode("lb", 10007)
	lb["type"], lb["member_node"] = "load_balance", []string{"b", "a"}
	prepared, err := prepare(Snapshot{lb, a, b, c}, "lb")
	if err != nil {
		t.Fatal(err)
	}
	n := prepared.nodes[0]
	members := n.(*protocol.LoadBalance).Members
	if members[0].Base().Name != "b" || members[1].Base().Name != "a" {
		t.Fatal("member order changed")
	}
	upstream := members[0].(protocol.RemoteConfig).Endpoint().Upstream
	if upstream != members[1].(protocol.RemoteConfig).Endpoint().Upstream {
		t.Fatal("shared upstream was copied")
	}
	if prepared.nodes[3] != upstream {
		t.Fatal("resolved graph did not reuse the shared upstream")
	}
	// Validation follows object references even when the input section is unchanged.
	upstream.(protocol.RemoteConfig).Endpoint().Upstream = members[0]
	if err := validateDependencies(n); err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("expected graph cycle, got %v", err)
	}
}

func TestReferenceListForms(t *testing.T) {
	for _, tc := range []struct {
		input any
		want  []string
	}{
		{"a", []string{"a"}}, {[]string{"b", "a"}, []string{"b", "a"}},
	} {
		lb := graphNode("lb", 10001)
		lb["type"], lb["member_node"] = "load_balance", tc.input
		prepared, err := prepare(Snapshot{lb, graphNode("a", 10003), graphNode("b", 10005)}, "lb")
		if err != nil {
			t.Fatal(err)
		}
		var got []string
		for _, member := range prepared.nodes[0].(*protocol.LoadBalance).Members {
			got = append(got, member.Base().Name)
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("got %v, want %v", got, tc.want)
		}
	}
	for _, value := range []any{"", nil, []any{42}} {
		lb := graphNode("lb", 10001)
		lb["type"], lb["member_node"] = "load_balance", value
		if _, err := prepare(Snapshot{lb}, "lb"); err == nil {
			t.Fatalf("invalid members accepted: %v", value)
		}
	}
}

func TestSharedDependencyDepth(t *testing.T) {
	a, b, c, d := graphNode("a", 10001), graphNode("b", 10003), graphNode("c", 10005), graphNode("d", 10007)
	a["upstream_proxy_node"], b["upstream_proxy_node"], c["upstream_proxy_node"] = "b", "c", "d"
	lb := graphNode("lb", 10009)
	lb["type"], lb["member_node"] = "load_balance", []string{"c", "a"}
	_, err := prepare(Snapshot{lb, a, b, c, d}, "lb")
	if err == nil || !strings.Contains(err.Error(), "three nodes") {
		t.Fatalf("shared dependency concealed excessive depth: %v", err)
	}
}

func TestPreviewDependencies(t *testing.T) {
	for _, core := range []string{"sing-box", "xray"} {
		t.Run(core, func(t *testing.T) {
			a, b, unrelated := graphNode("a", 10001), graphNode("b", 10003), graphNode("unused", 10005)
			a["core"], a["enabled"], a["upstream_proxy_node"] = core, "0", "b"
			b["type"] = "custom"
			unrelated["server_port"] = "invalid"
			if _, err := RenderTarget(Snapshot{a, b, unrelated}, "a"); err != nil {
				t.Fatal(err)
			}
			b["enabled"] = "0"
			if _, err := RenderTarget(Snapshot{a, b, unrelated}, "a"); err == nil {
				t.Fatal("disabled dependency accepted")
			}
		})
	}
}

func TestInvalidResolvedGraphs(t *testing.T) {
	for _, tc := range []struct {
		name, want string
		change     func(uci.Section, uci.Section, uci.Section)
	}{
		{"duplicate", "duplicate load balancing member", func(lb, a, b uci.Section) { lb["member_node"] = []string{"a", "a"} }},
		{"fallback", "not a load balancing member", func(lb, a, b uci.Section) { lb["fallback_tag"] = "absent" }},
		{"nested", "nested load balancing", func(lb, a, b uci.Section) { a["type"], a["member_node"] = "load_balance", []string{"b"} }},
		{"member cycle", "cycle", func(lb, a, b uci.Section) { a["upstream_proxy_node"] = "lb" }},
		{"balance upstream", "cannot have an upstream", func(lb, a, b uci.Section) { lb["upstream_proxy_node"] = "a" }},
		{"malformed members", "member_node", func(lb, a, b uci.Section) { lb["member_node"] = []any{42} }},
		{"malformed upstream", "upstream_proxy_node", func(lb, a, b uci.Section) { a["upstream_proxy_node"] = []string{"b"} }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			lb, a, b := graphNode("lb", 10001), graphNode("a", 10003), graphNode("b", 10005)
			lb["type"], lb["member_node"] = "load_balance", []string{"a", "b"}
			tc.change(lb, a, b)
			_, err := prepare(Snapshot{lb, a, b}, "lb")
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want %q, got %v", tc.want, err)
			}
		})
	}
}
