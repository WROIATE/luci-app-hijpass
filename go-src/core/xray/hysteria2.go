package xray

import (
	"fmt"

	"hijpass/config/core"
	"hijpass/config/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func buildHysteria2(n *protocol.Hysteria2) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: n.Type, Tag: n.Name}
	var e error
	o.Protocol = "hysteria"
	o.Settings, e = core.RawSettings(xr.HysteriaClientConfig{Version: 2, Address: Address(n.Server), Port: uint16(n.ServerPort)})
	o.StreamSetting = &xr.StreamConfig{
		Network:  core.Ptr(xr.TransportProtocol("hysteria")),
		Security: "tls",
		TLSSettings: &xr.TLSConfig{
			ServerName: core.Fallback(n.TLSServerName,
				n.Server),
			ALPN: core.Ptr(xr.StringList{"h3"}),
		},
		HysteriaSettings: &xr.HysteriaConfig{
			Version:        2,
			Auth:           n.Password,
			UdpIdleTimeout: int64(n.UDPIdleTimeout),
		},
	}
	if n.UpMbps != nil || n.DownMbps != nil {
		o.StreamSetting.FinalMask = &xr.FinalMask{QuicParams: &xr.QuicParamsConfig{BrutalUp: xrBandwidth(n.UpMbps), BrutalDown: xrBandwidth(n.DownMbps)}}
	}

	return o, e
}
func xrBandwidth(v *int64) xr.Bandwidth {
	if v == nil {
		return ""
	}
	if *v == 0 {
		return "0"
	}
	return xr.Bandwidth(fmt.Sprintf("%d mbps", *v))
}
