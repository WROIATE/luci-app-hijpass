package singbox

import (
	"net/netip"

	"hijpass/config/generator/coreconfig"
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
		{Type: C.TypeTProxy, Tag: coreconfig.TProxyInbound, Options: &sb.TProxyInboundOptions{ListenOptions: Listen(n.ListenPort, coreconfig.LoopbackAddress)}},
		{Type: C.TypeSOCKS, Tag: coreconfig.SocksInbound, Options: &sb.SocksInboundOptions{ListenOptions: Listen(n.SocksPort, coreconfig.LoopbackAddress)}},
	}
}
