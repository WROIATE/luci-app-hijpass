package protocol

import (
	"hijpass/config/generator/constant"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
)

// Socks builds an outbound to a local proxy listener.
func Socks(tag string, port uint16) sb.Outbound {
	return sb.Outbound{Type: C.TypeSOCKS, Tag: tag, Options: &sb.SOCKSOutboundOptions{Server: constant.LoopbackAddress, ServerPort: port, Version: "5"}}
}
