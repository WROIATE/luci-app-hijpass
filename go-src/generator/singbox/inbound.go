package singbox

import (
	"net/netip"

	"hijpass/config/generator/protocol"

	sb "github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json/badoption"
)

func Listen(port uint16, address string) sb.ListenOptions {
	return sb.ListenOptions{Listen: Ptr(badoption.Addr(netip.MustParseAddr(address))), ListenPort: port}
}

func sbInbounds(n protocol.BaseOptions) []sb.Inbound {
	return []sb.Inbound{
		{Type: "tproxy", Tag: "tproxy-in", Options: &sb.TProxyInboundOptions{ListenOptions: Listen(uint16(n.ListenPort), "127.0.0.1")}},
		{Type: "socks", Tag: "socks-in", Options: &sb.SocksInboundOptions{ListenOptions: Listen(uint16(n.SocksPort), "127.0.0.1")}},
	}
}
