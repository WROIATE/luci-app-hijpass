package xray

import (
	xr "github.com/xtls/xray-core/infra/conf"
)

func Inbound(typ, tag string, port uint16, shunt bool) (xr.InboundDetourConfig, error) {

	o := xr.InboundDetourConfig{Tag: tag, PortList: &xr.PortList{Range: []xr.PortRange{{From: uint32(port), To: uint32(port)}}}}
	var e error
	if typ == "socks" {
		o.Protocol = "socks"
		o.Settings, e = RawSettings(xr.SocksServerConfig{UDP: true})
	} else {
		o.Protocol = "dokodemo-door"
		d := xr.DokodemoConfig{Network: Ptr(xr.NetworkList{"tcp", "udp"})}
		if typ == "tproxy" {
			d.FollowRedirect = true
			o.StreamSetting = &xr.StreamConfig{SocketSettings: &xr.SocketConfig{TProxy: "tproxy"}}
		} else {
			o.ListenOn = Address("::")
		}
		o.Settings, e = RawSettings(d)
	}
	if shunt && typ == "tproxy" {
		o.SniffingConfig = &xr.SniffingConfig{Enabled: true, DestOverride: xr.StringList{"http", "tls", "quic"}, RouteOnly: true}
	}
	return o, e
}
