package dns

import (
	"testing"

	"hijpass/config/uci"
)

func TestDNSPortValidationAndDisabledNodes(t *testing.T) {
	for _, port := range []string{"0", "-1", "65536", "invalid"} {
		if _, err := Decode([]uci.Section{{"tag": "dns", "type": "udp", "port": port}}); err == nil {
			t.Fatalf("accepted %s", port)
		}
	}
	servers, err := Decode([]uci.Section{{"tag": "off", "enabled": "0", "port": "invalid"}, {"tag": "on", "type": "udp", "port": "53"}})
	if err != nil || len(servers) != 1 || servers["on"].Port != 53 {
		t.Fatalf("%v %v", servers, err)
	}
	if _, err := Decode([]uci.Section{{"tag": "same"}, {"tag": "same"}}); err == nil {
		t.Fatal("duplicate DNS tag")
	}
}

func TestXrayHTTPSIPv6Address(t *testing.T) {
	for _, tc := range []struct {
		port uint16
		want string
	}{{0, "https://[2001:db8::1]/dns-query"}, {8443, "https://[2001:db8::1]:8443/dns-query"}} {
		server, err := XrayServer(&Server{Type: "https", Address: "2001:db8::1", Port: tc.port}, "dns")
		if err != nil {
			t.Fatal(err)
		}
		if got := server.Address.Address.String(); got != tc.want {
			t.Fatalf("%q != %q", got, tc.want)
		}
	}
}
