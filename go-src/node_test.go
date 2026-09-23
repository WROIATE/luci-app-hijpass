package main

import (
	"reflect"
	"testing"
)

func TestProtocolSpecificDecoding(t *testing.T) {
	cases := []struct {
		protocol string
		want     proxyNode
		stale    section
	}{
		{"shadowsocks", &shadowsocksNode{}, section{"tls_insecure": "invalid", "transport_ws_max_early_data": "invalid", "strategy_expected": "invalid"}},
		{"hysteria2", &hysteria2Node{}, section{"multiplex_max_connections": "invalid", "tls_reality_enabled": "invalid", "version": "invalid"}},
		{"tuic", &tuicNode{}, section{"hop_interval": "invalid", "udp_over_tcp": "invalid", "tls_reality_enabled": "invalid"}},
		{"shadowtls", &shadowTLSNode{}, section{"multiplex_enabled": "invalid", "tls_reality_enabled": "invalid", "heartbeat": "invalid"}},
		{"vless", &vlessNode{}, section{"udp_over_tcp": "invalid", "up_mbps": "invalid", "strategy_tolerance": "invalid", "version": "invalid"}},
		{"load_balance", &loadBalanceNode{}, section{"server_port": "invalid", "tls_insecure": "invalid", "multiplex_enabled": "invalid"}},
	}
	for _, tc := range cases {
		t.Run(tc.protocol, func(t *testing.T) {
			s := section{".name": "node", "name": "node", "type": tc.protocol, "listen_port": "11001", "socks_port": "12001", "server": "example.org", "server_port": "443"}
			before, err := parseNode(s)
			if err != nil {
				t.Fatal(err)
			}
			if reflect.TypeOf(before) != reflect.TypeOf(tc.want) {
				t.Fatalf("got %T, want %T", before, tc.want)
			}
			for key, value := range tc.stale {
				s[key] = value
			}
			after, err := parseNode(s)
			if err != nil {
				t.Fatalf("unrelated protocol field affected decoding: %v", err)
			}
			if !reflect.DeepEqual(before, after) {
				t.Fatal("unrelated protocol fields changed the typed node")
			}
			_, remote := after.(remoteProxyNode)
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
			s := section{"type": tc.protocol, "listen_port": "11001", "socks_port": "12001", "server": "example.org", "server_port": "443", tc.key: tc.value}
			if _, err := parseNode(s); err == nil {
				t.Fatalf("invalid %s accepted by %s", tc.key, tc.protocol)
			}
		})
	}
	if _, err := parseNode(section{"type": "unknown"}); err == nil {
		t.Fatal("unknown protocol accepted")
	}
}
