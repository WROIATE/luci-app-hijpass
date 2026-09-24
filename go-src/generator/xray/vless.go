package xray

import (
	"hijpass/config/generator/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func buildVLESS(n *protocol.VLESS) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: n.Type, Tag: n.Name}
	var e error
	o.Settings, e = RawSettings(xr.VLessOutboundConfig{Address: Address(n.Server), Port: uint16(n.ServerPort), Id: n.UUID, Encryption: "none", Flow: n.Flow})
	st := &xr.StreamConfig{Network: Ptr(xr.TransportProtocol("raw")), Security: "none"}
	o.StreamSetting = st
	if n.RealityEnabled {
		st.Security = "reality"
		st.REALITYSettings = &xr.REALITYConfig{Fingerprint: "chrome", ServerName: Fallback(n.TLSServerName, n.Server), Password: n.RealityPublicKey, ShortId: n.RealityShortID}
	} else if n.TLSServerName != "" {
		st.Security = "tls"
		st.TLSSettings = &xr.TLSConfig{ServerName: n.TLSServerName, ALPN: Ptr(xr.StringList{"h2", "http/1.1"})}
	}
	if err := applyTransport(st, n.TransportOptions); err != nil {
		return o, err
	}
	return o, e
}
