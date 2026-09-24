package singbox

import (
	"fmt"

	"hijpass/config/protocol"

	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func buildLoadBalance(options *sb.Options, n *protocol.LoadBalance, resolvePort func(string) (uint16, error)) error {

	lb := &sb.URLTestOutboundOptions{URL: n.URL, Interval: badoption.Duration(n.Interval), Tolerance: uint16(n.Tolerance), IdleTimeout: badoption.Duration(n.IdleTimeout), InterruptExistConnections: bool(n.InterruptConnections)}
	options.Outbounds = append(options.Outbounds, sb.Outbound{Type: "urltest", Tag: "slb", Options: lb})
	for i, name := range n.Members {
		port, e := resolvePort(name)
		if e != nil {
			return e
		}
		tag := fmt.Sprintf("lb-member-%d", i)
		lb.Outbounds = append(lb.Outbounds, tag)
		options.Outbounds = append(options.Outbounds, Socks(tag, port))
	}
	options.Route.Final = "slb"
	return nil
}
