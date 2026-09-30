package singbox

import (
	"fmt"

	"hijpass/config/generator/constant"
	"hijpass/config/generator/singbox/protocol"
	uciprotocol "hijpass/config/uci/protocol"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func buildLoadBalance(options *sb.Options, n *uciprotocol.LoadBalance) {

	lb := &sb.URLTestOutboundOptions{URL: n.URL, Interval: badoption.Duration(n.Interval), Tolerance: uint16(n.Tolerance), IdleTimeout: badoption.Duration(n.IdleTimeout), InterruptExistConnections: bool(n.InterruptConnections)}
	options.Outbounds = append(options.Outbounds, sb.Outbound{
		Type:    C.TypeURLTest,
		Tag:     constant.LoadBalance,
		Options: lb,
	})
	for i, member := range n.Members {
		port := member.Base().SocksPort
		tag := fmt.Sprintf("%s%d", constant.LoadBalanceMemberPrefix, i)
		lb.Outbounds = append(lb.Outbounds, tag)
		options.Outbounds = append(options.Outbounds, protocol.Socks(tag, port))
	}
	options.Route.Final = constant.LoadBalance
}
