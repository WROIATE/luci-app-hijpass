package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const generatedManifest = "/etc/hijpass/generated-files.json"

// Track only files written by this generator. A file now owned by a custom node
// is user input and must be retained, even if an earlier run generated it.
func staleFiles(c config, previous, current []string) []string {
	dir := filepath.Clean(c.first("hijpass").val("client_dir", "/etc/hijpass/client"))
	keep := map[string]bool{}
	for _, p := range current {
		keep[p] = true
	}
	for _, s := range c.of("proxy_node") {
		keep[filepath.Join(dir, s.val("name", s.str(".name"))+"-"+s.str(".name")+".json")] = true
	}
	var stale []string
	for _, p := range previous {
		if keep[p] || filepath.Dir(p) != dir || !strings.HasSuffix(p, ".json") || !safeName.MatchString(filepath.Base(p)) {
			continue
		}
		stale = append(stale, p)
	}
	return stale
}
func publishGenerated(c config, files []outputFile) error {
	var previous []string
	b, e := os.ReadFile(generatedManifest)
	if e == nil {
		if e = json.Unmarshal(b, &previous); e != nil {
			return fmt.Errorf("invalid generated file manifest: %w", e)
		}
	} else if !os.IsNotExist(e) {
		return e
	}
	var current []string
	dir := filepath.Clean(c.first("hijpass").val("client_dir", "/etc/hijpass/client"))
	for _, f := range files {
		if f.core != "" && filepath.Dir(f.path) == dir {
			current = append(current, f.path)
		}
	}
	b, e = json.Marshal(current)
	if e != nil {
		return e
	}
	files = append(files, outputFile{path: generatedManifest, data: b})
	if e = publish(files); e != nil {
		return e
	}
	for _, p := range staleFiles(c, previous, current) {
		if e = os.Remove(p); e != nil && !os.IsNotExist(e) {
			fmt.Fprintf(os.Stderr, "Unable to remove stale generated config %s: %v\n", p, e)
		}
	}
	return nil
}
