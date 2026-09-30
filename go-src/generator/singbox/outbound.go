package singbox

import (
	"hijpass/config/generator/constant"
	"hijpass/config/generator/singbox/protocol"
	uciprotocol "hijpass/config/uci/protocol"

	sb "github.com/sagernet/sing-box/option"
)

// buildRemote adds the protocol outbound and its optional upstream SOCKS hop.
func buildRemote(options *sb.Options, node uciprotocol.RemoteConfig) error {
	out, err := protocol.Build(node)
	if err != nil {
		return err
	}
	options.Outbounds = append(options.Outbounds, out)
	if upstream := node.Endpoint().Upstream; upstream != nil {
		port := upstream.Base().SocksPort
		tag := constant.UpstreamPrefix + upstream.Base().Name
		dialer := out.Options.(sb.DialerOptionsWrapper)
		d := dialer.TakeDialerOptions()
		d.Detour = tag
		dialer.ReplaceDialerOptions(d)
		options.Outbounds = append(options.Outbounds, protocol.Socks(tag, port))
	}
	return nil
}
