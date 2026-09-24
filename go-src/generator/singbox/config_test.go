package singbox

import (
	sb "github.com/sagernet/sing-box/option"
	"testing"
)

func TestDNSDetourAndRuleStrategy(t *testing.T) {
	server, err := DNSServer("udp", "192.0.2.53", 53, "rule-dns", "proxy")
	if err != nil {
		t.Fatal(err)
	}
	remote := server.Options.(*sb.RemoteDNSServerOptions)
	if remote.Detour != "proxy" || remote.ServerPort != 53 {
		t.Fatalf("unexpected server: %+v", remote)
	}
	options := &sb.Options{DNS: &sb.DNSOptions{}}
	AddDNSRule(options, server, sb.RawDefaultDNSRule{Domain: []string{"example.org"}}, "4")
	rule := options.DNS.Rules[0].DefaultOptions
	if rule.RouteOptions.Server != "rule-dns" || rule.RouteOptions.Strategy != DNSStrategy("4") || !rule.RouteOptions.DisableCache {
		t.Fatalf("unexpected DNS rule: %+v", rule)
	}
}
