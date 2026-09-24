package generator

import (
	"strings"
	"testing"

	"hijpass/config/uci"
)

// Public entry points must reject the same invalid configuration and return no
// partial output, including when a preview's dependency is the invalid node.
func assertGenerationFailure(t *testing.T, c Snapshot, want string, targets ...string) {
	t.Helper()
	check := func(t *testing.T, err error) {
		t.Helper()
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("want %q, got %v", want, err)
		}
	}
	t.Run("full", func(t *testing.T) {
		out, err := Render(c)
		check(t, err)
		if out.Nodes != nil || out.Shunt != nil {
			t.Fatal("failed generation returned partial output")
		}
	})
	t.Run("validate", func(t *testing.T) { check(t, Validate(c)) })
	for _, target := range targets {
		t.Run("preview-"+target, func(t *testing.T) {
			out, err := RenderTarget(c, target)
			check(t, err)
			if out != nil {
				t.Fatal("failed preview returned output")
			}
		})
	}
}

func TestProxyPreflightAcrossEntryPoints(t *testing.T) {
	for _, core := range []string{"sing-box", "xray"} {
		for _, tc := range []struct {
			name, want string
			change     func(Snapshot) Snapshot
		}{
			{"own ports", "shared", func(c Snapshot) Snapshot {
				c[0]["socks_port"] = c[0]["listen_port"]
				return c
			}},
			{"dependency ports", "shared", func(c Snapshot) Snapshot {
				c[1]["listen_port"] = c[0]["socks_port"]
				return c
			}},
			{"ambiguous dependency", "duplicate proxy name", func(c Snapshot) Snapshot {
				other := graphNode("other", 12001)
				other["name"] = "b"
				return append(c, other)
			}},
			{"unknown dependency core", "unsupported core", func(c Snapshot) Snapshot {
				c[1]["core"] = "unknown"
				return c
			}},
			{"unsupported dependency protocol", "unsupported Xray protocol", func(c Snapshot) Snapshot {
				c[1]["type"], c[1]["core"] = "tuic", "xray"
				return c
			}},
			{"unsupported dependency option", "udp_over_tcp", func(c Snapshot) Snapshot {
				c[1]["type"], c[1]["core"], c[1]["udp_over_tcp"] = "shadowsocks", "xray", "1"
				return c
			}},
		} {
			for _, kind := range []string{"shadowsocks", "load_balance"} {
				t.Run(core+"/"+kind+"/"+tc.name, func(t *testing.T) {
					c := routingSnapshot(core)
					c[0]["core"], c[0]["type"] = core, kind
					if kind == "load_balance" {
						c[0]["member_node"] = []string{"b"}
					} else {
						c[0]["upstream_proxy_node"] = "b"
					}
					assertGenerationFailure(t, tc.change(c), tc.want, "a", "shunt")
				})
			}
		}
	}
}

func TestShuntPortConflicts(t *testing.T) {
	for _, core := range []string{"sing-box", "xray"} {
		for _, tc := range []struct{ key, port string }{
			{"shunt_listen_port", "10153"},
			{"shunt_listen_port", "11001"}, {"shunt_listen_port", "11004"},
			{"dns_listen_port", "11001"}, {"dns_listen_port", "11004"},
		} {
			t.Run(core+"/"+tc.key+"/"+tc.port, func(t *testing.T) {
				c := routingSnapshot(core)
				c.First("shunt")[tc.key] = tc.port
				assertGenerationFailure(t, c, "shared", "shunt")
				if _, err := RenderTarget(c, "a"); err != nil {
					t.Fatalf("unrelated shunt affected node preview: %v", err)
				}
				c.First("shunt")["enabled"] = "0"
				if _, err := Render(c); err != nil {
					t.Fatalf("disabled shunt affected full generation: %v", err)
				}
				if _, err := RenderTarget(c, "shunt"); err == nil || !strings.Contains(err.Error(), "shared") {
					t.Fatalf("explicit disabled-shunt preview skipped port checks: %v", err)
				}
			})
		}
	}
}

func TestNodePreviewScope(t *testing.T) {
	a, b := graphNode("a", 11001), graphNode("b", 11003)
	a["enabled"], a["upstream_proxy_node"] = "0", "b"
	unused, duplicate := graphNode("unused", 11001), graphNode("duplicate", 11001)
	unused["core"], unused["server_port"], unused["upstream_proxy_node"] = "unknown", "invalid", "absent"
	duplicate["name"] = "unused"
	c := Snapshot{a, b, unused, duplicate}
	if _, err := RenderTarget(c, "a"); err != nil {
		t.Fatalf("unrelated invalid nodes affected preview: %v", err)
	}
	// A disabled root cannot reuse an enabled node's name, even though only the
	// root and its dependency are decoded for this preview.
	duplicate["name"] = "a"
	if _, err := RenderTarget(c, "a"); err == nil || !strings.Contains(err.Error(), "duplicate proxy name") {
		t.Fatalf("ambiguous disabled preview root accepted: %v", err)
	}
}

func TestCustomDependencyPreflight(t *testing.T) {
	for _, field := range []string{"type", "core"} {
		t.Run(field, func(t *testing.T) {
			a, b := graphNode("a", 11001), graphNode("b", 11003)
			a["upstream_proxy_node"], b[field], b["server_port"] = "b", "custom", "invalid"
			c := Snapshot{a, b}
			out, err := Render(c)
			if err != nil || len(out.Nodes) != 1 || out.Nodes["a"] == nil {
				t.Fatalf("custom entry was generated or decoded as a remote proxy: %v", err)
			}
			if _, err := RenderTarget(c, "a"); err != nil {
				t.Fatal(err)
			}
			b["upstream_proxy_node"] = "a"
			assertGenerationFailure(t, c, "cycle", "a")
		})
	}
}

func TestValidateDisabledService(t *testing.T) {
	a := graphNode("a", 11001)
	a["server_port"] = "unfinished"
	c := Snapshot{a, uci.Section{".name": "hijpass", ".type": "hijpass", "enabled": "0"}}
	if err := Validate(c); err != nil {
		t.Fatalf("cannot save unfinished config with service disabled: %v", err)
	}
	if _, err := Render(c); err == nil {
		t.Fatal("explicit generation skipped field validation")
	}
	a["server_port"] = 42
	if err := Validate(c); err == nil {
		t.Fatal("disabled service skipped input shape validation")
	}
}
