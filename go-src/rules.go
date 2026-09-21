package main

import (
	sb "github.com/sagernet/sing-box/option"
	"path"
	"strconv"
	"strings"
)

type rule struct {
	domain, suffix, keyword, regex, ip, geoIP, geoSite, network, protocol, ranges []string
	ports                                                                         []int
	sets                                                                          []sb.RuleSet
}

func parseRule(s section) rule {
	r := rule{network: s.list("network"), protocol: s.list("protocol")}
	for _, p := range s.list("port") {
		if n, e := strconv.Atoi(p); e == nil {
			r.ports = append(r.ports, n)
		}
	}
	for _, p := range s.list("port_range") {
		r.ranges = append(r.ranges, strings.Replace(p, "-", ":", 1))
	}
	for _, key := range []string{"domain_list", "ip_list"} {
		for _, line := range strings.Split(s.str(key), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if strings.HasPrefix(line, "rule-set:") {
				typ := "local"
				prefix := "rule-set:local:"
				if strings.HasPrefix(line, "rule-set:remote:") {
					typ = "remote"
					prefix = "rule-set:remote:"
				}
				p := strings.TrimPrefix(line, prefix)
				filename := path.Base(p)
				tag := strings.TrimSuffix(filename, path.Ext(filename))
				format := "source"
				if strings.HasSuffix(p, "srs") {
					format = "binary"
				}
				rs := sb.RuleSet{Tag: []string{tag}, Type: typ, Format: format}
				if typ == "remote" {
					rs.RemoteOptions.URL = p
				} else {
					rs.LocalOptions.Path = p
				}
				r.sets = append(r.sets, rs)
				continue
			}
			if key == "ip_list" {
				if strings.HasPrefix(line, "geoip:") {
					r.geoIP = append(r.geoIP, line)
				} else {
					r.ip = append(r.ip, line)
				}
				continue
			}
			switch {
			case strings.HasPrefix(line, "full:"):
				r.domain = append(r.domain, line[5:])
			case strings.HasPrefix(line, "domain:"):
				r.suffix = append(r.suffix, line[7:])
			case strings.HasPrefix(line, "regexp:"):
				r.regex = append(r.regex, line[7:])
			case strings.HasPrefix(line, "geosite:"):
				r.geoSite = append(r.geoSite, line)
			default:
				r.keyword = append(r.keyword, line)
			}
		}
	}
	return r
}
func (r rule) hasDomain() bool { return len(r.domain)+len(r.suffix)+len(r.keyword)+len(r.regex) > 0 }
func (r rule) empty(geo bool) bool {
	n := len(r.ip) + len(r.network) + len(r.protocol) + len(r.ports) + len(r.ranges)
	if geo {
		n += len(r.geoIP) + len(r.geoSite)
	} else {
		n += len(r.sets)
	}
	return !r.hasDomain() && n == 0
}
func (r rule) sbMatch() sb.RawDefaultRule {
	m := sb.RawDefaultRule{Domain: r.domain, DomainSuffix: r.suffix, DomainKeyword: r.keyword, DomainRegex: r.regex, IPCIDR: r.ip, Network: r.network, Protocol: r.protocol, PortRange: r.ranges}
	for _, p := range r.ports {
		m.Port = append(m.Port, uint16(p))
	}
	for _, s := range r.sets {
		m.RuleSet = append(m.RuleSet, s.Tag...)
	}
	return m
}
func (r rule) sbDNSMatch() sb.RawDefaultDNSRule {
	m := sb.RawDefaultDNSRule{Domain: r.domain, DomainSuffix: r.suffix, DomainKeyword: r.keyword, DomainRegex: r.regex}
	for _, s := range r.sets {
		m.RuleSet = append(m.RuleSet, s.Tag...)
	}
	return m
}
func (r rule) xrDomain() []string {
	var out []string
	for i, list := range [][]string{r.domain, r.suffix, r.keyword, r.regex, r.geoSite} {
		for _, v := range list {
			out = append(out, []string{"full:", "domain:", "", "regexp:", ""}[i]+v)
		}
	}
	return out
}
func (r *rule) convertGeo() {
	for _, v := range append(append([]string{}, r.geoSite...), r.geoIP...) {
		tag := strings.Replace(v, ":", "-", 1)
		r.sets = append(r.sets, sb.RuleSet{Tag: []string{tag}, Type: "local", Format: "binary", LocalOptions: sb.LocalRuleSet{Path: "/etc/hijpass/ruleset/" + tag + ".srs"}})
	}
}

// Xray's field rule is private in infra/conf/router.go.
type xrayRouteRule struct {
	RuleTag     string   `json:"ruleTag,omitempty"`
	InboundTag  []string `json:"inboundTag,omitempty"`
	OutboundTag string   `json:"outboundTag,omitempty"`
	BalancerTag string   `json:"balancerTag,omitempty"`
	Network     []string `json:"network,omitempty"`
	Protocol    []string `json:"protocol,omitempty"`
	Port        string   `json:"port,omitempty"`
	Domain      []string `json:"domain,omitempty"`
	IP          []string `json:"ip,omitempty"`
}

func (r rule) xrRules(name, out string, version int) []xrayRouteRule {
	base := xrayRouteRule{RuleTag: name, InboundTag: []string{"tproxy-in"}, OutboundTag: out, Network: r.network, Protocol: r.protocol}
	var ports []string
	for _, p := range r.ports {
		ports = append(ports, strconv.Itoa(p))
	}
	for _, p := range r.ranges {
		ports = append(ports, strings.Replace(p, ":", "-", 1))
	}
	base.Port = strings.Join(ports, ",")
	domains := r.xrDomain()
	var ips []string
	for _, ip := range r.ip {
		is6 := strings.Contains(ip, ":")
		if version == 0 || version == 6 && is6 || version == 4 && !is6 {
			ips = append(ips, ip)
		}
	}
	ips = append(ips, r.geoIP...)
	ipRange := ""
	if version == 4 {
		ipRange = "0.0.0.0/0"
	}
	if version == 6 {
		ipRange = "::/0"
	}
	var rules []xrayRouteRule
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
