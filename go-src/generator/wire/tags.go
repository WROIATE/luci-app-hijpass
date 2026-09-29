// Package wire defines fixed output values shared by the generator and core builders.
package wire

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
