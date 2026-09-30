// Package coreconfig defines values shared when generating Xray and sing-box configurations.
package coreconfig

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
	LoopbackAddress         = "127.0.0.1"
	UpstreamPrefix          = "upstream-"
)
