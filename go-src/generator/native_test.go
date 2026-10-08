package generator

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	xr "github.com/xtls/xray-core/infra/conf"
	dnsproxy "github.com/xtls/xray-core/proxy/dns"
)

func fixtureConfig(t *testing.T, name string) Snapshot {
	t.Helper()
	data, e := os.ReadFile("testdata/compatibility.json")
	if e != nil {
		t.Fatal(e)
	}
	var fixtures []struct {
		Name     string
		Sections Snapshot
	}
	if e = json.Unmarshal(data, &fixtures); e != nil {
		t.Fatal(e)
	}
	for _, f := range fixtures {
		if f.Name == name {
			return f.Sections
		}
	}
	t.Fatalf("fixture %s not found", name)
	return nil
}
func TestTypedNumericValidation(t *testing.T) {
	for _, tc := range []struct{ key, value string }{{"server_port", "65536"}, {"server_port", "443.5"}, {"multiplex_max_connections", "2147483648"}, {"strategy_tolerance", "NaN"}, {"strategy_tolerance", "+Inf"}, {"transport_ws_max_early_data", "4294967296"}, {"transport_grpc_idle_timeout", "-1s"}, {"transport_grpc_idle_timeout", "2147483648s"}, {"udp_over_tcp", "true"}} {
		t.Run(tc.key+"/"+tc.value, func(t *testing.T) {
			fixture := "sing-box-vless-defaults"
			if tc.key == "strategy_tolerance" {
				fixture = "sing-box-load-balance"
			}
			if tc.key == "udp_over_tcp" {
				fixture = "sing-box-shadowsocks-defaults"
			}
			c := fixtureConfig(t, fixture)
			target := c[1]
			if tc.key == "strategy_tolerance" {
				for _, s := range c.Of("proxy_node") {
					if s.String("type") == "load_balance" {
						target = s
					}
				}
			}
			target[tc.key] = tc.value
			if _, e := Render(c); e == nil {
				t.Fatal("invalid typed input accepted")
			}
		})
	}
}
func TestGeoConversionRetainsExplicitRuleSets(t *testing.T) {
	c := fixtureConfig(t, "sing-box-shunt-geo")
	for _, s := range c.Of("shunt_route_rule") {
		s["domain_list"] = s.String("domain_list") + "\nrule-set:remote:https://example.org/custom.srs"
	}
	g, e := Render(c)
	if e != nil {
		t.Fatal(e)
	}
	sets := g.Shunt.(*SingBoxConfig).Route.RuleSet
	if len(sets) != 3 {
		t.Fatalf("expected explicit plus both Geo sets: %v", sets)
	}
	if sets[0].Tag[0] != "custom" || sets[0].RemoteOptions.HTTPClient.Detour != "ruleset-out" {
		t.Fatal("explicit rule-set or download route was lost")
	}
}
func TestXrayNativeBuild(t *testing.T) {
	for _, name := range []string{"xray-shadowsocks-defaults", "xray-hysteria2-defaults", "xray-vless-defaults", "xray-load-balance", "xray-load-balance-options", "xray-shunt-rules", "xray-shunt-split"} {
		t.Run(name, func(t *testing.T) {
			c := fixtureConfig(t, name)
			g, e := Render(c)
			if e != nil {
				t.Fatal(e)
			}
			configs := []CoreConfig{}
			for _, o := range g.Nodes {
				configs = append(configs, o)
			}
			if g.Shunt != nil {
				configs = append(configs, g.Shunt)
			}
			for _, o := range configs {
				data, e := o.Serialize()
				if e != nil {
					t.Fatal(e)
				}
				var decoded xr.Config
				if e = json.Unmarshal(data, &decoded); e != nil {
					t.Fatal(e)
				}
				_, e = decoded.Build()
				if name == "xray-vless-defaults" {
					if e == nil || !strings.Contains(e.Error(), "vless without TLS or other encryption is prohibited") {
						t.Fatalf("expected upstream public plaintext rejection, got %v", e)
					}
				} else if e != nil {
					t.Fatal(e)
				}
			}
		})
	}
}
func TestPinnedSchemaMigrations(t *testing.T) {
	for _, co := range []string{"sing-box", "xray"} {
		t.Run(co, func(t *testing.T) {
			g, e := Render(fixtureConfig(t, co+"-shunt-block"))
			if e != nil {
				t.Fatal(e)
			}
			data, e := g.Shunt.Serialize()
			if e != nil {
				t.Fatal(e)
			}
			if co == "sing-box" {
				if strings.Contains(string(data), `"type":"block"`) || !strings.Contains(string(data), `"action":"reject"`) {
					t.Fatal("removed block outbound or missing reject rule")
				}
			} else {
				var settings xr.DNSOutboundConfig
				found := false
				for _, out := range g.Shunt.(*XrayConfig).OutboundConfigs {
					if out.Tag != "dns-out" {
						continue
					}
					found = true
					if e := json.Unmarshal(*out.Settings, &settings); e != nil {
						t.Fatal(e)
					}
				}
				if !found || settings.NonIPQuery != nil || settings.BlockTypes != nil || len(settings.Rules) != 2 {
					t.Fatal("expected native DNS rules without legacy policy")
				}
				built, e := settings.Build()
				if e != nil {
					t.Fatal(e)
				}
				rules := built.(*dnsproxy.Config).Rule
				if rules[0].Action != dnsproxy.RuleAction_Hijack || !reflect.DeepEqual(rules[0].QType, []int32{1, 28}) || rules[1].Action != dnsproxy.RuleAction_Return || rules[1].RCode != 5 || len(rules[1].QType) != 0 {
					t.Fatal("DNS policy must hijack A/AAAA and refuse other queries")
				}
			}
		})
	}
}
