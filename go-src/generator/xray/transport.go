package xray

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"hijpass/config/generator/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func applyTransport(st *xr.StreamConfig, n protocol.TransportOptions) error {
	switch n.Transport {
	case "":
	case "xhttp":
		st.Network = new(xr.TransportProtocol("xhttp"))
		st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.XHTTPHost, Path: Fallback(n.XHTTPPath, "/"), Mode: Fallback(n.XHTTPMode, "auto")}
	case "http":
		st.Network = new(xr.TransportProtocol("xhttp"))
		st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.HTTPHost, Path: Fallback(n.HTTPPath, "/"), Mode: "stream-one", UplinkHTTPMethod: n.HTTPMethod}
	case "httpupgrade":
		st.Network = new(xr.TransportProtocol("httpupgrade"))
		st.HTTPUPGRADESettings = &xr.HttpUpgradeConfig{Host: n.UpgradeHost, Path: Fallback(n.UpgradePath, "/")}
	case "ws":
		p := Fallback(n.WSPath, "/")
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
		st.Network = new(xr.TransportProtocol("websocket"))
		st.WSSettings = &xr.WebSocketConfig{Host: n.WSHost, Path: p}
	case "grpc":
		st.Network = new(xr.TransportProtocol("grpc"))
		st.GRPCSettings = &xr.GRPCConfig{
			ServiceName:         Fallback(n.GRPCService, "TunService"),
			IdleTimeout:         int32(time.Duration(n.GRPCIdle) / time.Second),
			HealthCheckTimeout:  int32(time.Duration(n.GRPCPing) / time.Second),
			PermitWithoutStream: bool(n.GRPCPermit),
		}
	default:
		return fmt.Errorf("unsupported Xray transport %q", n.Transport)
	}
	return nil
}
