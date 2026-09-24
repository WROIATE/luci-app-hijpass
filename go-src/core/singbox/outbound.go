package singbox

import (
	sb "github.com/sagernet/sing-box/option"
)

func Socks(tag string, port uint16) sb.Outbound {
	return sb.Outbound{Type: "socks", Tag: tag, Options: &sb.SOCKSOutboundOptions{ServerOptions: sb.ServerOptions{Server: "127.0.0.1", ServerPort: port}, Version: "5"}}
}
