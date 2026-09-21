package main

import (
	"path"
	"strconv"
	"strings"
)

type rule struct {
	domain, suffix, keyword, regex, ip, geoIP, geoSite, network, protocol, ranges []string
	ports                                                                         []int
	sets                                                                          []object
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
				rs := object{"tag": tag, "type": typ, "format": format}
				if typ == "remote" {
					rs["url"] = p
				} else {
					rs["path"] = p
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
func (r rule) sbDomain() object {
	var tags []string
	for _, s := range r.sets {
		tags = append(tags, s["tag"].(string))
	}
	return object{"domain": r.domain, "domain_suffix": r.suffix, "domain_keyword": r.keyword, "domain_regex": r.regex, "rule_set": tags}
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
	r.sets = nil
	for _, v := range append(append([]string{}, r.geoSite...), r.geoIP...) {
		tag := strings.Replace(v, ":", "-", 1)
		r.sets = append(r.sets, object{"tag": tag, "type": "local", "format": "binary", "path": "/etc/hijpass/ruleset/" + tag + ".srs"})
	}
}
func (r rule) xrRules(name, out string, version int) []object {
	base := object{"ruleTag": name, "inboundTag": []string{"tproxy-in"}, "outboundTag": out, "network": r.network, "protocol": r.protocol}
	var ports []string
	for _, p := range r.ports {
		ports = append(ports, strconv.Itoa(p))
	}
	base["port"] = strings.Join(append(ports, r.ranges...), ",")
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
	var rules []object
	if len(domains) > 0 {
		d := copyObj(base)
		d["domain"] = domains
		if ipRange != "" {
			d["ip"] = []string{ipRange}
		}
		rules = append(rules, d)
	}
	if len(ips) > 0 {
		i := copyObj(base)
		i["ip"] = ips
		rules = append(rules, i)
	}
	if len(domains)+len(ips) == 0 {
		if ipRange != "" {
			base["ip"] = []string{ipRange}
		}
		rules = append(rules, base)
	}
	return rules
}
