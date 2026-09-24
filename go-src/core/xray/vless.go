package xray

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"hijpass/config/core"
	"hijpass/config/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func buildVLESS(n *protocol.VLESS) (xr.OutboundDetourConfig, error) {
	o := xr.OutboundDetourConfig{Protocol: n.Type, Tag: n.Name}
	var e error
	o.Settings, e = core.RawSettings(xr.VLessOutboundConfig{Address: Address(n.Server), Port: uint16(n.ServerPort), Id: n.UUID, Encryption: "none", Flow: n.Flow})
	st := &xr.StreamConfig{Network: core.Ptr(xr.TransportProtocol("raw")), Security: "none"}
	o.StreamSetting = st
	if n.RealityEnabled {
		st.Security = "reality"
		st.REALITYSettings = &xr.REALITYConfig{Fingerprint: "chrome", ServerName: core.Fallback(n.TLSServerName, n.Server), Password: n.RealityPublicKey, ShortId: n.RealityShortID}
	} else if n.TLSServerName != "" {
		st.Security = "tls"
		st.TLSSettings = &xr.TLSConfig{ServerName: n.TLSServerName, ALPN: core.Ptr(xr.StringList{"h2", "http/1.1"})}
	}
	switch n.Transport {
	case "":
	case "xhttp":
		st.Network = core.Ptr(xr.TransportProtocol("xhttp"))
		st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.XHTTPHost, Path: core.Fallback(n.XHTTPPath, "/"), Mode: core.Fallback(n.XHTTPMode, "auto")}
	case "http":
		st.Network = core.Ptr(xr.TransportProtocol("xhttp"))
		st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.HTTPHost, Path: core.Fallback(n.HTTPPath, "/"), Mode: "stream-one", UplinkHTTPMethod: n.HTTPMethod}
	case "httpupgrade":
		st.Network = core.Ptr(xr.TransportProtocol("httpupgrade"))
		st.HTTPUPGRADESettings = &xr.HttpUpgradeConfig{Host: n.UpgradeHost, Path: core.Fallback(n.UpgradePath, "/")}
	case "ws":
		p := core.Fallback(n.WSPath, "/")
		if n.WSEarlyData > 0 {
			base, hash, hasHash := strings.Cut(p, "#")
			sep := "?"
			if strings.Contains(base, "?") {
				sep = "&"
			}
			p = base + sep + "ed=" + url.QueryEscape(fmt.Sprint(n.WSEarlyData))
			if hasHash {
				p += "#" + hash
			}
		}
		st.Network = core.Ptr(xr.TransportProtocol("websocket"))
		st.WSSettings = &xr.WebSocketConfig{Host: n.WSHost, Path: p}
	case "grpc":
		st.Network = core.Ptr(xr.TransportProtocol("grpc"))
		st.GRPCSettings = &xr.GRPCConfig{
			ServiceName:         core.Fallback(n.GRPCService, "TunService"),
			IdleTimeout:         int32(time.Duration(n.GRPCIdle) / time.Second),
			HealthCheckTimeout:  int32(time.Duration(n.GRPCPing) / time.Second),
			PermitWithoutStream: bool(n.GRPCPermit),
		}
	default:
		return o, fmt.Errorf("unsupported Xray transport %q", n.Transport)
	}
	return o, e
}
