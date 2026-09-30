package singbox

import (
	"net/netip"

	"hijpass/config/generator/constant"
	"hijpass/config/generator/protocol"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func Listen(port uint16, address string) sb.ListenOptions {
	return sb.ListenOptions{Listen: new(badoption.Addr(netip.MustParseAddr(address))), ListenPort: port}
}

func sbInbounds(n protocol.BaseOptions) []sb.Inbound {
	return []sb.Inbound{
		{Type: C.TypeTProxy, Tag: constant.TProxyInbound, Options: &sb.TProxyInboundOptions{ListenOptions: Listen(n.ListenPort, constant.LoopbackAddress)}},
		{Type: C.TypeSOCKS, Tag: constant.SocksInbound, Options: &sb.SocksInboundOptions{ListenOptions: Listen(n.SocksPort, constant.LoopbackAddress)}},
	}
}
