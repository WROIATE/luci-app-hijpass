package main

import (
	"encoding/json"
	"errors"
	"hijpass/config/core"
	"hijpass/config/feature"
	"os"
)

func rpc(method string) any {
	var req struct {
		Sections string `json:"sections"`
		Target   string `json:"target"`
	}
	fail := func(err error) any { return rpcResponse{Error: err.Error()} }
	if method != "render" && method != "validate" {
		return fail(errors.New("unknown method"))
	}
	if err := decodeInput(os.Stdin, &req); err != nil {
		return fail(err)
	}
	var c feature.Config
	if err := json.Unmarshal([]byte(req.Sections), &c); err != nil {
		return fail(err)
	}
	if err := feature.Validate(c); err != nil {
		return fail(err)
	}
	if method == "validate" && c.First("hijpass").String("enabled") == "0" {
		return rpcResponse{OK: true}
	}
	if method == "render" && req.Target != "" {
		var o *core.Config
		var err error
		if req.Target == "shunt" {
			o, err = c.Shunt()
		} else {
			found := false
			for _, s := range c.Of("proxy_node") {
				if s.String(".name") == req.Target {
					found = true
					o, err = c.Proxy(s)
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
		return rpcResponse{Config: o}
	}
	out, err := feature.Render(c)
	if err != nil {
		return fail(err)
	}
	if method == "validate" {
		return rpcResponse{OK: true}
	}
	return out
}

type rpcResponse struct {
	Error  string       `json:"error,omitempty"`
	OK     bool         `json:"ok,omitempty"`
	Config *core.Config `json:"config,omitempty"`
}
