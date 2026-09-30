// Package constant defines values shared by the configuration generators.
package constant

const (
	TProxyInbound           = "tproxy-in"
	SocksInbound            = "socks-in"
	DNSInbound              = "dns-in"
	DirectOutbound          = "direct-out"
	BlockOutbound           = "block"
	DNSOutbound             = "dns-out"
	LoadBalance             = "slb"
	LoadBalanceMemberPrefix = "lb-member-"
	RuleSetOutbound         = "ruleset-out"
	RuleSetDNSResolver      = "ruleset-dns-resolver"
	LocalDNS                = "local"
	UpstreamPrefix          = "upstream-"
)
