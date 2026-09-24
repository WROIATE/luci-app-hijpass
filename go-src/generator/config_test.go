package generator

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"hijpass/config/config"
)

func TestCompatibility(t *testing.T) {
	b, e := os.ReadFile("../testdata/compatibility.json")
	if e != nil {
		t.Fatal(e)
	}
	var cases []struct {
		Name     string
		Sections config.Snapshot
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
