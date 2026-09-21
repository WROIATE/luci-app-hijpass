package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
)

type outputFile struct {
	path string
	data []byte
	core string
}

var safeName = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)
var safeGeo = regexp.MustCompile(`^[A-Za-z0-9_.!,@-]+$`)

func resolveServers(c config, g generated) error {
	for _, s := range c.of("proxy_node") {
		o, ok := g.Nodes[s.str(".name")]
		if !ok || s.str("upstream_proxy_node") == "" {
			continue
		}
		host := s.str("server")
		if net.ParseIP(host) != nil {
			continue
		}
		b, e := command(10*time.Second, "/usr/lib/hijpass/net.sh", "resolve", host)
		if e != nil {
			return fmt.Errorf("node %q: %w", s.str("name"), e)
		}
		var v struct {
			Address string `json:"address"`
		}
		if e = json.Unmarshal(b, &v); e != nil {
			return e
		}
		if net.ParseIP(v.Address) == nil {
			return fmt.Errorf("node %q: server resolution failed", s.str("name"))
		}
		// Substitute only the dial address after building TLS/Reality settings,
		// exactly as the former browser generator did. Never change SNI/security.
		if err := o.replaceServer(v.Address); err != nil {
			return err
		}
	}
	return nil
}

func outputFiles(c config, g generated) ([]outputFile, error) {
	global := c.first("hijpass")
	dir := global.val("client_dir", "/etc/hijpass/client")
	var files []outputFile
	used := map[string]bool{}
	add := func(path string, o *coreConfig, co string) error {
		if !filepath.IsAbs(path) || filepath.Clean(path) != path {
			return fmt.Errorf("invalid absolute output path %q", path)
		}
		if used[path] {
			return fmt.Errorf("duplicate output path %q", path)
		}
		used[path] = true
		b, e := encode(o)
		if e != nil {
			return e
		}
		files = append(files, outputFile{path, append(b, '\n'), co})
		return nil
	}
	for _, s := range c.of("proxy_node") {
		o, ok := g.Nodes[s.str(".name")]
		if !ok {
			continue
		}
		name := s.val("name", s.str(".name"))
		id := s.str(".name")
		if !safeName.MatchString(name) || !safeName.MatchString(id) {
			return nil, fmt.Errorf("unsafe node filename: %q", name)
		}
		if e := add(filepath.Join(dir, name+"-"+id+".json"), o, core(s)); e != nil {
			return nil, e
		}
	}
	if g.Shunt != nil {
		co := c.first("shunt").str("type")
		if co == "singbox" {
			co = "sing-box"
		}
		if e := add(global.val("shunt_conf", "/etc/hijpass/shunt.json"), g.Shunt, co); e != nil {
			return nil, e
		}
	}
	return files, nil
}

// Stage every file before replacing any live file. Roll back already replaced files
// on ordinary I/O errors; process/power loss across multiple renames is not atomic.
func publish(files []outputFile) error {
	seen := map[string]bool{}
	for _, f := range files {
		if seen[f.path] {
			return fmt.Errorf("duplicate output path %q", f.path)
		}
		seen[f.path] = true
	}

	type staged struct {
		outputFile
		temp    string
		old     []byte
		existed bool
	}
	var all []staged
	defer func() {
		for _, f := range all {
			os.Remove(f.temp)
		}
	}()
	for _, f := range files {
		if err := os.MkdirAll(filepath.Dir(f.path), 0700); err != nil {
			return err
		}
		st := staged{outputFile: f}
		info, e := os.Lstat(f.path)
		if e == nil {
			if !info.Mode().IsRegular() {
				return fmt.Errorf("refusing non-regular output %s", f.path)
			}
			st.existed = true
			st.old, e = os.ReadFile(f.path)
		}
		if e != nil && !os.IsNotExist(e) {
			return e
		}
		tmp, e := os.CreateTemp(filepath.Dir(f.path), ".hijpass-*")
		if e != nil {
			return e
		}
		st.temp = tmp.Name()
		all = append(all, st)
		if _, e = tmp.Write(f.data); e == nil {
			e = tmp.Sync()
		}
		closeErr := tmp.Close()
		if e != nil {
			return e
		}
		if closeErr != nil {
			return closeErr
		}
	}
	for i, f := range all {
		if e := os.Rename(f.temp, f.path); e != nil {
			var rollback []error
			for _, prev := range all[:i] {
				if prev.existed {
					tmp, err := os.CreateTemp(filepath.Dir(prev.path), ".hijpass-rollback-*")
					if err == nil {
						_, err = tmp.Write(prev.old)
						closeErr := tmp.Close()
						if err == nil {
							err = closeErr
						}
						if err == nil {
							err = os.Rename(tmp.Name(), prev.path)
						}
						os.Remove(tmp.Name())
					}
					if err != nil {
						rollback = append(rollback, err)
					}
				} else if err := os.Remove(prev.path); err != nil {
					rollback = append(rollback, err)
				}
			}
			return errors.Join(append([]error{e}, rollback...)...)
		}
	}
	return nil
}
func generate() error {
	if err := os.MkdirAll("/var/lock", 0755); err != nil {
		return err
	}
	lock, e := os.OpenFile("/var/lock/hijpass-config.lock", os.O_CREATE|os.O_RDWR, 0600)
	if e != nil {
		return e
	}
	defer lock.Close()
	if e = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); e != nil {
		return errors.New("configuration generation is already running")
	}
	c, e := loadConfig()
	if e != nil {
		return e
	}
	if c.first("hijpass").str("enabled") == "0" {
		return nil
	}
	g, e := render(c)
	if e != nil {
		return e
	}
	if e = resolveServers(c, g); e != nil {
		return e
	}
	files, e := outputFiles(c, g)
	if e != nil {
		return e
	}
	stage, e := os.MkdirTemp("", "hijpass-config-*")
	if e != nil {
		return e
	}
	defer os.RemoveAll(stage)
	// Convert Geo resources before core validation. The check-only JSON references
	// staged resources; the published JSON keeps the stable runtime paths.
	geo := geoRules{GeoSite: []string{}, GeoIP: []string{}}
	replacements := map[string]string{}
	shunt := c.first("shunt")
	if shunt.str("enabled") != "0" && (shunt.str("type") == "sing-box" || shunt.str("type") == "singbox") && shunt.str("ruleset_convert") == "1" {
		seen := map[string]bool{}
		for _, s := range c.of("shunt_route_rule") {
			if s.str("enabled") != "1" {
				continue
			}
			r := parseRule(s)
			for _, item := range append(r.geoSite, r.geoIP...) {
				if seen[item] {
					continue
				}
				seen[item] = true
				typ, tag, _ := strings.Cut(item, ":")
				if !safeGeo.MatchString(tag) {
					return fmt.Errorf("invalid Geo tag %q", tag)
				}
				if typ == "geosite" {
					geo.GeoSite = append(geo.GeoSite, tag)
				} else {
					geo.GeoIP = append(geo.GeoIP, tag)
				}
				name := typ + "-" + tag + ".srs"
				dest := "/etc/hijpass/ruleset/" + name
				tmp := filepath.Join(stage, name)
				if _, e = command(30*time.Second, "geoview", "-type", typ, "-action", "convert", "-format", "ruleset", "-input", "/usr/share/v2ray/"+typ+".dat", "-regex", "-list", tag, "-output", tmp); e != nil {
					return e
				}
				b, e := os.ReadFile(tmp)
				if e != nil {
					return e
				}
				files = append(files, outputFile{path: dest, data: b})
				replacements[dest] = tmp
			}
		}
	}
	b, e := json.Marshal(geo)
	if e != nil {
		return e
	}
	files = append(files, outputFile{path: "/etc/hijpass/generated-georules.json", data: b})
	for i, f := range files {
		if f.core == "" {
			continue
		}
		check := string(f.data)
		for from, to := range replacements {
			a, _ := json.Marshal(from)
			b, _ := json.Marshal(to)
			check = strings.ReplaceAll(check, string(a), string(b))
		}
		path := filepath.Join(stage, fmt.Sprintf("check-%d.json", i))
		if e = os.WriteFile(path, []byte(check), 0600); e != nil {
			return e
		}
		args := []string{"check", "-c", path}
		if f.core == "xray" {
			args = []string{"run", "-test", "-c", path}
		}
		if _, e = command(30*time.Second, f.core, args...); e != nil {
			return fmt.Errorf("validate %s: %w", f.path, e)
		}
	}
	return publishGenerated(c, files)
}

type geoRules struct {
	GeoSite []string `json:"geosite"`
	GeoIP   []string `json:"geoip"`
}
