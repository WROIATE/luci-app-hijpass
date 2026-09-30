package xray

import (
	"fmt"
	"net"
	"strconv"

	"hijpass/config/generator/xray/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

func DNSServer(kind, address string, port uint16, tag string) (*xr.NameServerConfig, error) {

	addr := address
	o := &xr.NameServerConfig{Tag: tag, SkipFallback: true}
	switch kind {
	case "tcp", "quic":
		addr = kind + "://" + addr
		o.Port = port
	case "https":
		if port != 0 {
			addr = net.JoinHostPort(addr, strconv.Itoa(int(port)))
		} else if net.ParseIP(addr) != nil && net.ParseIP(addr).To4() == nil {
			addr = "[" + addr + "]"
		}
		addr = "https://" + addr + "/dns-query"
	case "udp":
		o.Port = port
	default:
		return nil, fmt.Errorf("invalid Xray DNS type %q", kind)
	}
	o.Address = protocol.Address(addr)
	return o, nil
}

func DNSStrategy(s string) string {
	switch s {
	case "4":
		return "UseIPv4"
	case "6":
		return "UseIPv6"
	case "64", "46":
		return domainStrategyUseIP
	}
	return ""
}
