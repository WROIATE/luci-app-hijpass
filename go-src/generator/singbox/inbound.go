package singbox

import (
	"net/netip"

	"hijpass/config/generator/protocol"
	"hijpass/config/generator/tags"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

const loopbackAddress = "127.0.0.1"

func Listen(port uint16, address string) sb.ListenOptions {
	return sb.ListenOptions{Listen: new(badoption.Addr(netip.MustParseAddr(address))), ListenPort: port}
}

func sbInbounds(n protocol.BaseOptions) []sb.Inbound {
	return []sb.Inbound{
		{Type: C.TypeTProxy, Tag: tags.TProxyInbound, Options: &sb.TProxyInboundOptions{ListenOptions: Listen(n.ListenPort, loopbackAddress)}},
		{Type: C.TypeSOCKS, Tag: tags.SocksInbound, Options: &sb.SocksInboundOptions{ListenOptions: Listen(n.SocksPort, loopbackAddress)}},
	}
}
