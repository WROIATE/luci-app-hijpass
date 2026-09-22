package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestCompatibility(t *testing.T) {
	b, e := os.ReadFile("testdata/compatibility.json")
	if e != nil {
		t.Fatal(e)
	}
	var cases []struct {
		Name     string
		Sections config
		Expected any
	}
	if e = json.Unmarshal(b, &cases); e != nil {
		t.Fatal(e)
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			g, e := render(tc.Sections)
			if tc.Name == "xray-shadowsocks-options" {
				if e == nil || !strings.Contains(e.Error(), "no longer supports Shadowsocks udp_over_tcp") {
					t.Fatalf("expected explicit removed-UoT error, got %v", e)
				}
				// Still compare every supported option after the user disables
				// the removed setting; do not discard this regression sample.
				for _, s := range tc.Sections.of("proxy_node") {
					s["udp_over_tcp"] = "0"
				}
				g, e = render(tc.Sections)
			}
			if e != nil {
				t.Fatal(e)
			}
			compareBaseline(t, g, tc.Sections, tc.Expected)
		})
	}
}
func TestPublishPreservesOldFilesOnStagingFailure(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "first.json")
	os.WriteFile(first, []byte("old"), 0600)
	blocked := filepath.Join(dir, "blocked")
	os.WriteFile(blocked, []byte("not a directory"), 0600)
	err := publish([]outputFile{{path: first, data: []byte("new")}, {path: filepath.Join(blocked, "second.json"), data: []byte("new")}})
	if err == nil {
		t.Fatal("expected staging failure")
	}
	b, _ := os.ReadFile(first)
	if string(b) != "old" {
		t.Fatal("old configuration was modified")
	}
	matches, _ := filepath.Glob(filepath.Join(dir, ".hijpass-*"))
	if len(matches) != 0 {
		t.Fatal("staged files leaked")
	}
}
func TestPublishPermissionsAndSymlink(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "node.json")
	if e := publish([]outputFile{{path: file, data: []byte("secret")}}); e != nil {
		t.Fatal(e)
	}
	st, _ := os.Stat(file)
	if st.Mode().Perm() != 0600 {
		t.Fatal("configuration must be private")
	}
	link := filepath.Join(dir, "link")
	os.Symlink(file, link)
	if e := publish([]outputFile{{path: link, data: []byte("changed")}}); e == nil {
		t.Fatal("must reject symlinks")
	}
	b, _ := os.ReadFile(file)
	if string(b) != "secret" {
		t.Fatal("symlink target modified")
	}
}
func TestDependencyValidation(t *testing.T) {
	base := section{".name": "a", ".type": "proxy_node", "name": "a", "enabled": "1", "type": "shadowsocks", "core": "sing-box", "listen_port": "10001", "socks_port": "10002"}
	for _, tc := range []struct {
		name     string
		other    section
		upstream string
	}{
		{"missing", nil, "missing"}, {"self", nil, "a"}, {"cycle", section{".name": "b", ".type": "proxy_node", "name": "b", "enabled": "1", "type": "shadowsocks", "listen_port": "10003", "socks_port": "10004", "upstream_proxy_node": "a"}, "b"},
		{"disabled", section{".name": "b", ".type": "proxy_node", "name": "b", "enabled": "0"}, "b"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := clone(base)
			s["upstream_proxy_node"] = tc.upstream
			c := config{s}
			if tc.other != nil {
				c = append(c, tc.other)
			}
			if e := c.validateDependencies(); e == nil {
				t.Fatal("expected validation failure")
			}
		})
	}
}

func TestStaleFilesPreserveCustomAndUnmanagedPaths(t *testing.T) {
	c := config{{".type": "hijpass", "client_dir": "/etc/hijpass/client"}, {".type": "proxy_node", ".name": "custom", "name": "custom", "core": "custom"}}
	previous := []string{"/etc/hijpass/client/deleted-id.json", "/etc/hijpass/client/custom-custom.json", "/etc/hijpass/client/current-id.json", "/etc/passwd", "/other/old.json"}
	got := staleFiles(c, previous, []string{"/etc/hijpass/client/current-id.json"})
	if !reflect.DeepEqual(got, []string{"/etc/hijpass/client/deleted-id.json"}) {
		t.Fatalf("unexpected deletions: %v", got)
	}
}

func TestOutputFilesPreserveCustomConfiguration(t *testing.T) {
	c := config{{".type": "hijpass", ".name": "global"}, {".type": "proxy_node", ".name": "custom", "name": "custom", "enabled": "1", "core": "custom", "type": "custom", "listen_port": "12001", "socks_port": "12002"}, {".type": "shunt", ".name": "shunt", "config_type": "custom"}}
	g, e := render(c)
	if e != nil {
		t.Fatal(e)
	}
	files, e := outputFiles(c, g)
	if e != nil {
		t.Fatal(e)
	}
	if len(files) != 0 {
		t.Fatal("custom configuration must not be overwritten")
	}
}

func TestPublishRejectsDuplicatePaths(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if e := publish([]outputFile{{path: p, data: []byte("one")}, {path: p, data: []byte("two")}}); e == nil {
		t.Fatal("expected duplicate path error")
	}
	if _, e := os.Stat(p); !os.IsNotExist(e) {
		t.Fatal("duplicate output wrote a file")
	}
}

func clone(s section) section {
	o := section{}
	for k, v := range s {
		o[k] = v
	}
	return o
}
