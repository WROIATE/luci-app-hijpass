// Package tags defines output tag names and prefixes shared by the config generators.
package tags

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
