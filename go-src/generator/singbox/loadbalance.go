package singbox

import (
	"fmt"

	"hijpass/config/generator/protocol"
	"hijpass/config/generator/tags"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func buildLoadBalance(options *sb.Options, n *protocol.LoadBalance) {

	lb := &sb.URLTestOutboundOptions{URL: n.URL, Interval: badoption.Duration(n.Interval), Tolerance: uint16(n.Tolerance), IdleTimeout: badoption.Duration(n.IdleTimeout), InterruptExistConnections: bool(n.InterruptConnections)}
	options.Outbounds = append(options.Outbounds, sb.Outbound{
		Type:    C.TypeURLTest,
		Tag:     tags.LoadBalance,
		Options: lb,
	})
	for i, member := range n.Members {
		port := member.Base().SocksPort
		tag := fmt.Sprintf("%s%d", tags.LoadBalanceMemberPrefix, i)
		lb.Outbounds = append(lb.Outbounds, tag)
		options.Outbounds = append(options.Outbounds, Socks(tag, port))
	}
	options.Route.Final = tags.LoadBalance
}
