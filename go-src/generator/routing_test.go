package generator

import (
	"encoding/json"
	"fmt"
	sb "github.com/sagernet/sing-box/option"
	"reflect"
	"strings"
	"testing"

	xr "github.com/xtls/xray-core/infra/conf"
	"hijpass/config/uci"
)

func TestDNSPortValidationAndDisabledNodes(t *testing.T) {
	for _, port := range []string{"0", "-1", "65536", "invalid"} {
		if _, err := decodeDNS([]uci.Section{{"tag": "dns", "type": "udp", "port": port}}); err == nil {
			t.Fatalf("accepted %s", port)
		}
	}
	servers, err := decodeDNS([]uci.Section{{"tag": "off", "enabled": "0", "port": "invalid"}, {"tag": "on", "type": "udp", "port": "53"}})
	if err != nil || len(servers) != 1 || servers["on"].Port != 53 {
		t.Fatalf("%v %v", servers, err)
	}
	if _, err := decodeDNS([]uci.Section{{"tag": "same"}, {"tag": "same"}}); err == nil {
		t.Fatal("duplicate DNS tag")
	}
}

func routingSnapshot(core string) Snapshot {
	a, b := graphNode("a", 11001), graphNode("b", 11003)
	b["type"] = "custom"
	return Snapshot{
		a, b,
		{".name": "shunt", ".type": "shunt", "type": core, "config_type": "tmpl", "enabled": "1", "shunt_listen_port": "18081", "dns_listen_port": "10153", "default_proxy_node": "b", "default_dns_node": "dns"},
		{".name": "dns", ".type": "shunt_dns_node", "tag": "dns", "type": "udp", "server": "1.1.1.1", "port": "53", "enabled": "1"},
		{".name": "rule", ".type": "shunt_route_rule", "name": "rule", "enabled": "1", "domain_list": "full:example.org", "proxy_node": "a", "dns_proxy_node": "b", "dns_node": "dns"},
	}
}

func TestShuntReferenceFailures(t *testing.T) {
	for _, core := range []string{"sing-box", "xray"} {
		for _, tc := range []struct{ section, key string }{
			{"shunt", "default_proxy_node"}, {"shunt", "ruleset_out_node"},
			{"shunt", "default_dns_node"}, {"shunt", "ruleset_dns_node"},
			{"shunt_route_rule", "proxy_node"}, {"shunt_route_rule", "proxy_node_v4"},
			{"shunt_route_rule", "proxy_node_v6"}, {"shunt_route_rule", "dns_proxy_node"},
			{"shunt_route_rule", "dns_node"},
		} {
			if core == "xray" && tc.key == "ruleset_dns_node" {
				continue
			}
			for _, disabled := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/%s/disabled=%v", core, tc.key, disabled), func(t *testing.T) {
					c := routingSnapshot(core)
					c.First("shunt")["default_proxy_node"] = "a"
					c.First("shunt_route_rule")["dns_proxy_node"] = "a"
					s := c.First(tc.section)
					s[tc.key] = "missing"
					if tc.key == "proxy_node_v4" || tc.key == "proxy_node_v6" {
						s["ip_version_split"] = "1"
						s["dns_proxy_node"] = "a"
					}
					if tc.key == "ruleset_dns_node" {
						s["ruleset_out_node"] = "b"
					}
					if disabled {
						if tc.key == "default_dns_node" || tc.key == "ruleset_dns_node" || tc.key == "dns_node" {
							s[tc.key] = "off"
							off := clone(c.First("shunt_dns_node"))
							off[".name"], off["tag"], off["enabled"] = "off", "off", "0"
							c = append(c, off)
						} else {
							s[tc.key] = "b"
							c[1]["enabled"] = "0"
						}
					}
					if _, err := Render(c); err == nil {
						t.Fatal("full generation accepted unresolved reference")
					}
					if _, err := RenderTarget(c, "shunt"); err == nil {
						t.Fatal("preview accepted unresolved reference")
					}
				})
			}
		}
	}
}

func TestShuntPreviewChecksProxyGraph(t *testing.T) {
	for _, core := range []string{"sing-box", "xray"} {
		for _, tc := range []struct {
			name, want string
			change     func(Snapshot)
		}{
			{"cycle", "cycle", func(c Snapshot) { c[0]["upstream_proxy_node"] = "b"; c[1]["upstream_proxy_node"] = "a" }},
			{"missing upstream", "missing or disabled", func(c Snapshot) { c[0]["upstream_proxy_node"] = "absent" }},
			{"duplicate name", "duplicate proxy name", func(c Snapshot) { c[1]["name"] = "a" }},
			{"port conflict", "shared", func(c Snapshot) { c[1]["socks_port"] = c[0]["socks_port"] }},
		} {
			t.Run(core+"/"+tc.name, func(t *testing.T) {
				c := routingSnapshot(core)
				tc.change(c)
				_, err := RenderTarget(c, "shunt")
				if err == nil || !strings.Contains(err.Error(), tc.want) {
					t.Fatalf("want %q, got %v", tc.want, err)
				}
			})
		}
	}
}

func TestShuntResolvedOutput(t *testing.T) {
	for _, core := range []string{"sing-box", "xray"} {
		for _, exit := range []string{"a", "hijpass-direct"} {
			t.Run(core+"/"+exit, func(t *testing.T) {
				c := routingSnapshot(core)
				c[0]["upstream_proxy_node"] = "b"
				shunt := c.First("shunt")
				shunt["ruleset_out_node"], shunt["ruleset_dns_node"] = exit, "dns"
				rule := c.First("shunt_route_rule")
				rule["ip_version_split"], rule["proxy_node_v4"], rule["proxy_node_v6"] = "1", "a", "b"
				rule["dns_node"] = "alternate"
				c = append(c, uci.Section{".name": "alternate", ".type": "shunt_dns_node", "tag": "alternate", "type": "udp", "server": "9.9.9.9", "port": "53"})
				full, err := Render(c)
				if err != nil {
					t.Fatal(err)
				}
				preview, err := RenderTarget(c, "shunt")
				if err != nil {
					t.Fatal(err)
				}
				want, err := json.Marshal(full.Shunt)
				if err != nil {
					t.Fatal(err)
				}
				got, err := json.Marshal(preview)
				if err != nil {
					t.Fatal(err)
				}
				if string(got) != string(want) {
					t.Fatal("preview and full generation differ")
				}
				if core == "sing-box" {
					config := preview.(*SingBoxConfig)
					var tags []string
					for _, out := range config.Outbounds {
						tags = append(tags, out.Tag)
						if out.Tag == "a" || out.Tag == "b" || out.Tag == "ruleset-out" && exit == "a" {
							socks := out.Options.(*sb.SOCKSOutboundOptions)
							port := uint16(11002)
							if out.Tag == "b" {
								port = 11004
							}
							if socks.Server != "127.0.0.1" || socks.ServerPort != port {
								t.Fatalf("wrong SOCKS endpoint: %+v", socks)
							}
						}
					}
					if !reflect.DeepEqual(tags, []string{"direct-out", "a", "b", "ruleset-out"}) {
						t.Fatalf("outbound order: %v", tags)
					}
					out := config.Outbounds[3]
					if exit == "hijpass-direct" && out.Type != "direct" {
						t.Fatal("direct ruleset exit changed")
					}
					if out.Options.(sb.DialerOptionsWrapper).TakeDialerOptions().DomainResolver.Server != "ruleset-dns-resolver" {
						t.Fatal("ruleset DNS reference lost")
					}
					dns := config.DNS.Servers[1]
					if dns.Tag != "ruleset-dns-resolver" || dns.Options.(*sb.RemoteDNSServerOptions).Detour != "ruleset-out" {
						t.Fatal("ruleset DNS detour lost")
					}
					ruleDNS := config.DNS.Servers[2]
					if ruleDNS.Tag != "rule-dns" || ruleDNS.Options.(*sb.RemoteDNSServerOptions).Server != "9.9.9.9" {
						t.Fatal("explicit rule DNS reference lost")
					}
					if config.Route.Final != "b" || config.DNS.Final != "dns" {
						t.Fatal("default references changed")
					}
				} else {
					config := preview.(*XrayConfig)
					if config.DNSConfig.Servers[0].Address.String() != "9.9.9.9" {
						t.Fatal("explicit rule DNS reference lost")
					}
					if config.OutboundConfigs[0].Tag != "b" {
						t.Fatal("default exit not first")
					}
					for _, out := range config.OutboundConfigs[:2] {
						var settings xr.SocksClientConfig
						if err := json.Unmarshal(*out.Settings, &settings); err != nil {
							t.Fatal(err)
						}
						port := uint16(11002)
						if out.Tag == "b" {
							port = 11004
						}
						if settings.Address == nil || settings.Address.String() != "127.0.0.1" || settings.Port != port {
							t.Fatalf("wrong SOCKS endpoint: %+v", settings)
						}
					}
				}
			})
		}
	}
}
