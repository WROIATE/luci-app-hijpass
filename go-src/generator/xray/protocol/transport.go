package protocol

import (
	"cmp"
	"fmt"
	"net/url"
	"strings"
	"time"

	uciprotocol "hijpass/config/uci/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func applyTransport(st *xr.StreamConfig, n uciprotocol.TransportOptions) error {
	switch n.Transport {
	case "":
	case "xhttp":
		st.Network = new(xr.TransportProtocol("xhttp"))
		st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.XHTTPHost, Path: cmp.Or(n.XHTTPPath, "/"), Mode: cmp.Or(n.XHTTPMode, "auto")}
	case "http":
		st.Network = new(xr.TransportProtocol("xhttp"))
		st.XHTTPSettings = &xr.SplitHTTPConfig{Host: n.HTTPHost, Path: cmp.Or(n.HTTPPath, "/"), Mode: "stream-one", UplinkHTTPMethod: n.HTTPMethod}
	case "httpupgrade":
		st.Network = new(xr.TransportProtocol("httpupgrade"))
		st.HTTPUPGRADESettings = &xr.HttpUpgradeConfig{Host: n.UpgradeHost, Path: cmp.Or(n.UpgradePath, "/")}
	case "ws":
		p := cmp.Or(n.WSPath, "/")
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
			ServiceName:         cmp.Or(n.GRPCService, "TunService"),
			IdleTimeout:         int32(time.Duration(n.GRPCIdle) / time.Second),
			HealthCheckTimeout:  int32(time.Duration(n.GRPCPing) / time.Second),
			PermitWithoutStream: bool(n.GRPCPermit),
		}
	default:
		return fmt.Errorf("unsupported Xray transport %q", n.Transport)
	}
	return nil
}
