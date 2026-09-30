package xray

import (
	"hijpass/config/generator/xray/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

const (
	inboundTProxy = "tproxy"
	inboundSocks  = "socks"
)

func Inbound(typ, tag string, port uint16, shunt bool) (xr.InboundDetourConfig, error) {

	o := xr.InboundDetourConfig{Tag: tag, PortList: &xr.PortList{Range: []xr.PortRange{{From: uint32(port), To: uint32(port)}}}}
	var e error
	if typ == inboundSocks {
		o.Protocol = inboundSocks
		o.Settings, e = protocol.RawSettings(xr.SocksServerConfig{UDP: true})
	} else {
		o.Protocol = "dokodemo-door"
		d := xr.DokodemoConfig{Network: new(xr.NetworkList{"tcp", "udp"})}
		if typ == inboundTProxy {
			d.FollowRedirect = true
			o.StreamSetting = &xr.StreamConfig{SocketSettings: &xr.SocketConfig{TProxy: inboundTProxy}}
		} else {
			o.ListenOn = protocol.Address("::")
		}
		o.Settings, e = protocol.RawSettings(d)
	}
	if shunt && typ == inboundTProxy {
		o.SniffingConfig = &xr.SniffingConfig{Enabled: true, DestOverride: xr.StringList{"http", "tls", "quic"}, RouteOnly: true}
	}
	return o, e
}
