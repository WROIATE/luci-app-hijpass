package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"time"
)

const maxInput = 4 << 20

type generated struct {
	Nodes map[string]object `json:"nodes"`
	Shunt object            `json:"shunt,omitempty"`
}

func decodeInput(r io.Reader, v any) error {
	b, e := io.ReadAll(io.LimitReader(r, maxInput+1))
	if e != nil {
		return e
	}
	if len(b) > maxInput {
		return errors.New("configuration exceeds 4 MiB")
	}
	return json.Unmarshal(b, v)
}
func validateInput(c config) error {
	if len(c) == 0 {
		return errors.New("configuration is empty")
	}
	ids := map[string]bool{}
	for _, s := range c {
		if s == nil || s.str(".name") == "" || s.str(".type") == "" {
			return errors.New("section requires .name and .type")
		}
		if ids[s.str(".name")] {
			return fmt.Errorf("duplicate section %q", s.str(".name"))
		}
		ids[s.str(".name")] = true
		for k, v := range s {
			if len(k) > 0 && k[0] == '.' {
				continue
			}
			switch x := v.(type) {
			case string:
			case []any:
				for _, item := range x {
					if _, ok := item.(string); !ok {
						return fmt.Errorf("%s: %s must be a string list", s.str(".name"), k)
					}
				}
			default:
				return fmt.Errorf("%s: %s must be a string or string list", s.str(".name"), k)
			}
		}
	}
	return nil
}
func render(c config) (generated, error) {
	out := generated{Nodes: map[string]object{}}
	if err := validateInput(c); err != nil {
		return out, err
	}
	if err := c.validateDependencies(); err != nil {
		return out, err
	}
	for _, s := range c.of("proxy_node") {
		if s.str("enabled") != "1" || s.str("type") == "custom" || core(s) == "custom" {
			continue
		}
		o, err := c.proxy(s)
		if err != nil {
			return out, fmt.Errorf("node %q: %w", s.str("name"), err)
		}
		out.Nodes[s.str(".name")] = o
	}
	s := c.first("shunt")
	if s.str("enabled") != "0" && s.str("config_type") == "tmpl" {
		o, err := c.shunt()
		if err != nil {
			return out, err
		}
		out.Shunt = o
	}
	return out, nil
}
func command(timeout time.Duration, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	if name == "xray" {
		cmd.Env = append(os.Environ(), "XRAY_LOCATION_ASSET=/usr/share/v2ray")
	}
	out, e := cmd.Output()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("%s timed out", name)
	}
	if e != nil {
		return nil, fmt.Errorf("%s failed: %w", name, e)
	}
	return out, nil
}
func loadConfig() (config, error) {
	// No browser session: use system UCI, including CLI deltas in /tmp/.uci,
	// matching config_load in the init script. Browser drafts remain isolated.
	b, e := command(10*time.Second, "ubus", "call", "uci", "get", `{"config":"hijpass"}`)
	if e != nil {
		return nil, e
	}
	var v struct {
		Values map[string]section `json:"values"`
	}
	if e = json.Unmarshal(b, &v); e != nil {
		return nil, e
	}
	var c config
	for id, s := range v.Values {
		s[".name"] = id
		c = append(c, s)
	}
	sort.Slice(c, func(i, j int) bool { a, _ := c[i][".index"].(float64); b, _ := c[j][".index"].(float64); return a < b })
	return c, nil
}
func rpc(method string) any {
	var req struct {
		Sections string `json:"sections"`
		Target   string `json:"target"`
	}
	fail := func(err error) any { return object{"error": err.Error()} }
	if method != "render" && method != "validate" {
		return fail(errors.New("unknown method"))
	}
	if err := decodeInput(os.Stdin, &req); err != nil {
		return fail(err)
	}
	var c config
	if err := json.Unmarshal([]byte(req.Sections), &c); err != nil {
		return fail(err)
	}
	if err := validateInput(c); err != nil {
		return fail(err)
	}
	if method == "validate" && c.first("hijpass").str("enabled") == "0" {
		return object{"ok": true}
	}
	if method == "render" && req.Target != "" {
		var o object
		var err error
		if req.Target == "shunt" {
			o, err = c.shunt()
		} else {
			found := false
			for _, s := range c.of("proxy_node") {
				if s.str(".name") == req.Target {
					found = true
					o, err = c.proxy(s)
					break
				}
			}
			if !found {
				err = errors.New("node not found")
			}
		}
		if err != nil {
			return fail(err)
		}
		return object{"config": clean(o)}
	}
	out, err := render(c)
	if err != nil {
		return fail(err)
	}
	if method == "validate" {
		return object{"ok": true}
	}
	return object{"nodes": cleanNodes(out.Nodes), "shunt": clean(out.Shunt)}
}
func cleanNodes(nodes map[string]object) object {
	o := object{}
	for k, v := range nodes {
		o[k] = clean(v)
	}
	return o
}
func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: hijpass-config generate | render (JSON sections on stdin) | list | call METHOD")
	}
	switch os.Args[1] {
	case "list":
		return json.NewEncoder(os.Stdout).Encode(object{"render": object{"sections": "", "target": ""}, "validate": object{"sections": ""}})
	case "call":
		if len(os.Args) != 3 {
			return errors.New("missing RPC method")
		}
		return json.NewEncoder(os.Stdout).Encode(rpc(os.Args[2]))
	case "render":
		var c config
		if e := decodeInput(os.Stdin, &c); e != nil {
			return e
		}
		out, e := render(c)
		if e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(object{"nodes": cleanNodes(out.Nodes), "shunt": clean(out.Shunt)})
	case "generate":
		return generate()
	default:
		return errors.New("unknown command")
	}
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
