package protocol_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"hijpass/config/generator/protocol"
)

func decode(t *testing.T, kind string, options map[string]any) (protocol.Config, error) {
	t.Helper()
	fields := map[string]any{"type": kind, "listen_port": "11001", "socks_port": "12001", "server": "example.org", "server_port": "443"}
	for k, v := range options {
		fields[k] = v
	}
	data, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return protocol.Decode(data)
}

func TestDefaultsAndExplicitZero(t *testing.T) {
	node, err := decode(t, "tuic", nil)
	if err != nil {
		t.Fatal(err)
	}
	n := node.(*protocol.TUIC)
	if n.Heartbeat != 10*time.Second || n.CongestionControl != "cubic" {
		t.Fatalf("defaults lost: %+v", n)
	}
	node, err = decode(t, "tuic", map[string]any{"heartbeat": "0s", "zero_rtt_handshake": "1", "udp_over_stream": "0"})
	if err != nil {
		t.Fatal(err)
	}
	n = node.(*protocol.TUIC)
	if n.Heartbeat != 0 || !n.ZeroRTT || n.UDPOverStream {
		t.Fatalf("explicit values lost: %+v", n)
	}
	for _, value := range []any{"0", "", nil} {
		node, err = decode(t, "hysteria2", map[string]any{"up_mbps": value})
		if err != nil {
			t.Fatal(err)
		}
		h := node.(*protocol.Hysteria2)
		if h.DownMbps != nil {
			t.Fatal("absent bandwidth should remain nil")
		}
		if value == nil {
			if h.UpMbps != nil {
				t.Fatal("null bandwidth should remain nil")
			}
		} else if h.UpMbps == nil || *h.UpMbps != 0 {
			t.Fatal("explicit zero bandwidth must remain distinct from absence")
		}
	}
	node, err = decode(t, "load_balance", map[string]any{"strategy_tolerance": "0", "strategy_expected": "0"})
	if err != nil {
		t.Fatal(err)
	}
	lb := node.(*protocol.LoadBalance)
	if lb.StrategyTolerance != 0 || lb.StrategyExpected != 0 {
		t.Fatal("zero must override defaults")
	}
}

func TestInvalidWireValues(t *testing.T) {
	for _, tc := range []struct {
		kind, key string
		value     any
	}{
		{"tuic", "zero_rtt_handshake", "true"},
		{"tuic", "heartbeat", "-1s"},
		{"tuic", "server_port", 443},
		{"tuic", "server_port", "65536"},
		{"tuic", "server_port", "0"},
		{"tuic", "listen_port", "65536"},
		{"tuic", "socks_port", "-1"},
		{"hysteria2", "up_mbps", "-1"},
		{"hysteria2", "down_mbps", "9223372036854775808"},
		{"load_balance", "strategy_tolerance", "NaN"},
		{"load_balance", "strategy_tolerance", "+Inf"},
	} {
		t.Run(tc.key, func(t *testing.T) {
			_, err := decode(t, tc.kind, map[string]any{tc.key: tc.value})
			if err == nil || !strings.Contains(err.Error(), tc.key) {
				t.Fatalf("expected error naming %s, got %v", tc.key, err)
			}
		})
	}
}

func TestPortBounds(t *testing.T) {
	node, err := decode(t, "shadowsocks", map[string]any{
		"listen_port": "065535",
		"socks_port":  "1",
		"server_port": "65535",
	})
	if err != nil {
		t.Fatal(err)
	}
	base := node.Base()
	server := node.(protocol.RemoteConfig).Endpoint()
	if base.ListenPort != 65535 || base.SocksPort != 1 || server.ServerPort != 65535 {
		t.Fatalf("port boundary changed: %+v %+v", base, server)
	}
}
