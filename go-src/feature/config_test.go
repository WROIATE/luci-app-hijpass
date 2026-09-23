package feature

import (
	"encoding/json"
	"hijpass/config/uci"
	"os"
	"strings"
	"testing"
)

func TestCompatibility(t *testing.T) {
	b, e := os.ReadFile("../testdata/compatibility.json")
	if e != nil {
		t.Fatal(e)
	}
	var cases []struct {
		Name     string
		Sections Config
		Expected any
	}
	if e = json.Unmarshal(b, &cases); e != nil {
		t.Fatal(e)
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			g, e := Render(tc.Sections)
			if tc.Name == "xray-shadowsocks-options" {
				if e == nil || !strings.Contains(e.Error(), "no longer supports Shadowsocks udp_over_tcp") {
					t.Fatalf("expected explicit removed-UoT error, got %v", e)
				}
				// Still compare every supported option after the user disables
				// the removed setting; do not discard this regression sample.
				for _, s := range tc.Sections.Of("proxy_node") {
					s["udp_over_tcp"] = "0"
				}
				g, e = Render(tc.Sections)
			}
			if e != nil {
				t.Fatal(e)
			}
			compareBaseline(t, g, tc.Sections, tc.Expected)
		})
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
			c := Config{s}
			if tc.other != nil {
				c = append(c, tc.other)
			}
			if e := c.validateDependencies(); e == nil {
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
