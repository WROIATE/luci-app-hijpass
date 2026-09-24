package xray

import "testing"

func TestXrayHTTPSIPv6Address(t *testing.T) {
	for _, tc := range []struct {
		port uint16
		want string
	}{{0, "https://[2001:db8::1]/dns-query"}, {8443, "https://[2001:db8::1]:8443/dns-query"}} {
		server, err := DNSServer("https", "2001:db8::1", tc.port, "dns")
		if err != nil {
			t.Fatal(err)
		}
		if got := server.Address.Address.String(); got != tc.want {
			t.Fatalf("%q != %q", got, tc.want)
		}
	}
}
