package generator

import (
	"testing"

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
