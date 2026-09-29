package generator

import (
	"path"
	"strconv"
	"strings"

	"hijpass/config/generator/wire"
	"hijpass/config/generator/xray"
	"hijpass/config/uci"

	C "github.com/sagernet/sing-box/constant"
	sb "github.com/sagernet/sing-box/option"
)

type rule struct {
	Domain, Suffix, Keyword, Regex, IP, GeoIP, GeoSite, Network, Protocol, Ranges []string
	Ports                                                                         []uint16
	Sets                                                                          []sb.RuleSet
}

func parseRule(s uci.Section) rule {
	r := rule{Network: s.List("network"), Protocol: s.List("protocol")}
	for _, p := range s.List("port") {
		if n, e := uci.ParsePort(p); e == nil {
			r.Ports = append(r.Ports, n)
		}
	}
	for _, p := range s.List("port_range") {
		r.Ranges = append(r.Ranges, strings.Replace(p, "-", ":", 1))
	}
	for _, key := range []string{"domain_list", "ip_list"} {
		for _, line := range strings.Split(s.String(key), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if strings.HasPrefix(line, "rule-set:") {
				typ := C.RuleSetTypeLocal
				prefix := "rule-set:local:"
				if strings.HasPrefix(line, "rule-set:remote:") {
					typ = C.RuleSetTypeRemote
					prefix = "rule-set:remote:"
				}
				p := strings.TrimPrefix(line, prefix)
				filename := path.Base(p)
				tag := strings.TrimSuffix(filename, path.Ext(filename))
				format := C.RuleSetFormatSource
				if strings.HasSuffix(p, "srs") {
					format = C.RuleSetFormatBinary
				}
				rs := sb.RuleSet{Tag: []string{tag}, Type: typ, Format: format}
				if typ == C.RuleSetTypeRemote {
					rs.RemoteOptions.URL = p
				} else {
					rs.LocalOptions.Path = p
				}
				r.Sets = append(r.Sets, rs)
				continue
			}
			if key == "ip_list" {
				if strings.HasPrefix(line, "geoip:") {
					r.GeoIP = append(r.GeoIP, line)
				} else {
					r.IP = append(r.IP, line)
				}
				continue
			}
			switch {
			case strings.HasPrefix(line, "full:"):
				r.Domain = append(r.Domain, line[5:])
			case strings.HasPrefix(line, "domain:"):
				r.Suffix = append(r.Suffix, line[7:])
			case strings.HasPrefix(line, "regexp:"):
				r.Regex = append(r.Regex, line[7:])
			case strings.HasPrefix(line, "geosite:"):
				r.GeoSite = append(r.GeoSite, line)
			default:
				r.Keyword = append(r.Keyword, line)
			}
		}
	}
	return r
}
func (r *rule) HasDomain() bool { return len(r.Domain)+len(r.Suffix)+len(r.Keyword)+len(r.Regex) > 0 }
func (r *rule) Empty(geo bool) bool {
	n := len(r.IP) + len(r.Network) + len(r.Protocol) + len(r.Ports) + len(r.Ranges)
	if geo {
		n += len(r.GeoIP) + len(r.GeoSite)
	} else {
		n += len(r.Sets)
	}
	return !r.HasDomain() && n == 0
}
func (r *rule) SingBox() sb.RawDefaultRule {
	m := sb.RawDefaultRule{Domain: r.Domain, DomainSuffix: r.Suffix, DomainKeyword: r.Keyword, DomainRegex: r.Regex, IPCIDR: r.IP, Network: r.Network, Protocol: r.Protocol, PortRange: r.Ranges}
	for _, p := range r.Ports {
		m.Port = append(m.Port, p)
	}
	for _, s := range r.Sets {
		m.RuleSet = append(m.RuleSet, s.Tag...)
	}
	return m
}
func (r *rule) SingBoxDNS() sb.RawDefaultDNSRule {
	m := sb.RawDefaultDNSRule{Domain: r.Domain, DomainSuffix: r.Suffix, DomainKeyword: r.Keyword, DomainRegex: r.Regex}
	for _, s := range r.Sets {
		m.RuleSet = append(m.RuleSet, s.Tag...)
	}
	return m
}
func (r *rule) XrayDomains() []string {
	var out []string
	for i, list := range [][]string{r.Domain, r.Suffix, r.Keyword, r.Regex, r.GeoSite} {
		for _, v := range list {
			out = append(out, []string{"full:", "domain:", "", "regexp:", ""}[i]+v)
		}
	}
	return out
}
func (r *rule) ConvertGeo() {
	for _, v := range append(append([]string{}, r.GeoSite...), r.GeoIP...) {
		tag := strings.Replace(v, ":", "-", 1)
		r.Sets = append(r.Sets, sb.RuleSet{Tag: []string{tag}, Type: C.RuleSetTypeLocal, Format: C.RuleSetFormatBinary, LocalOptions: sb.LocalRuleSet{Path: "/etc/hijpass/ruleset/" + tag + ".srs"}})
	}
}

func (r *rule) XrayRules(name, out string, version int) []xray.XrayRouteRule {
	base := xray.XrayRouteRule{RuleTag: name, InboundTag: []string{wire.TProxyInbound}, OutboundTag: out, Network: r.Network, Protocol: r.Protocol}
	var ports []string
	for _, p := range r.Ports {
		ports = append(ports, strconv.FormatUint(uint64(p), 10))
	}
	for _, p := range r.Ranges {
		ports = append(ports, strings.Replace(p, ":", "-", 1))
	}
	base.Port = strings.Join(ports, ",")
	domains := r.XrayDomains()
	var ips []string
	for _, ip := range r.IP {
		is6 := strings.Contains(ip, ":")
		if version == 0 || version == 6 && is6 || version == 4 && !is6 {
			ips = append(ips, ip)
		}
	}
	ips = append(ips, r.GeoIP...)
	ipRange := ""
	if version == 4 {
		ipRange = "0.0.0.0/0"
	}
	if version == 6 {
		ipRange = "::/0"
	}
	var rules []xray.XrayRouteRule
	if len(domains) > 0 {
		d := base
		d.Domain = domains
		if ipRange != "" {
			d.IP = []string{ipRange}
		}
		rules = append(rules, d)
	}
	if len(ips) > 0 {
		i := base
		i.IP = ips
		rules = append(rules, i)
	}
	if len(domains)+len(ips) == 0 {
		if ipRange != "" {
			base.IP = []string{ipRange}
		}
		rules = append(rules, base)
	}
	return rules
}
