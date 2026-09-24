package dns

import (
	"fmt"
	"net"
	"strconv"

	"hijpass/config/core/xray"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
	xr "github.com/xtls/xray-core/infra/conf"
)

func SingBoxStrategy(s string) sb.DomainStrategy {
	switch s {
	case "4":
		return sb.DomainStrategy(C.DomainStrategyIPv4Only)
	case "6":
		return sb.DomainStrategy(C.DomainStrategyIPv6Only)
	case "46":
		return sb.DomainStrategy(C.DomainStrategyPreferIPv4)
	case "64":
		return sb.DomainStrategy(C.DomainStrategyPreferIPv6)
	default:
		return sb.DomainStrategy(C.DomainStrategyAsIS)
	}
}
func SingBoxServer(s *Server, tag, detour string) (sb.DNSServerOptions, error) {
	o := sb.DNSServerOptions{Tag: tag}
	if s == nil {
		return o, fmt.Errorf("DNS node for %q does not exist", tag)
	}
	o.Type = s.Type
	remote := sb.RemoteDNSServerOptions{DNSServerAddressOptions: sb.DNSServerAddressOptions{Server: s.Address, ServerPort: s.Port}}
	if detour != "direct-out" {
		remote.Detour = detour
	}
	switch o.Type {
	case "udp", "tcp":
		o.Options = &remote
	case "tls", "quic":
		o.Options = &sb.RemoteTLSDNSServerOptions{RemoteDNSServerOptions: remote}
	case "https":
		o.Options = &sb.RemoteHTTPSDNSServerOptions{RemoteTLSDNSServerOptions: sb.RemoteTLSDNSServerOptions{RemoteDNSServerOptions: remote}}
	case "local":
		o.Options = &sb.LocalDNSServerOptions{}
	default:
		return o, fmt.Errorf("invalid sing-box DNS type %q", o.Type)
	}
	return o, nil
}
func XrayServer(s *Server, tag string) (*xr.NameServerConfig, error) {
	if s == nil {
		return nil, fmt.Errorf("DNS node for %q does not exist", tag)
	}

	addr := s.Address
	o := &xr.NameServerConfig{Tag: tag, SkipFallback: true}
	switch s.Type {
	case "tcp", "quic":
		addr = s.Type + "://" + addr
		o.Port = s.Port
	case "https":
		if s.Port != 0 {
			addr = net.JoinHostPort(addr, strconv.Itoa(int(s.Port)))
		} else if net.ParseIP(addr) != nil && net.ParseIP(addr).To4() == nil {
			addr = "[" + addr + "]"
		}
		addr = "https://" + addr + "/dns-query"
	case "udp":
		o.Port = s.Port
	default:
		return nil, fmt.Errorf("invalid Xray DNS type %q", s.Type)
	}
	o.Address = xray.Address(addr)
	return o, nil
}
func Strategy(co, s string) string {
	if co == "xray" {
		switch s {
		case "4":
			return "UseIPv4"
		case "6":
			return "UseIPv6"
		case "64", "46":
			return "UseIP"
		}
	} else {
		switch s {
		case "4":
			return "ipv4_only"
		case "6":
			return "ipv6_only"
		case "64":
			return "prefer_ipv6"
		case "46":
			return "prefer_ipv4"
		}
	}
	return ""
}
