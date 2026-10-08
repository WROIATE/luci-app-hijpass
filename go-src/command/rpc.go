package command

import (
	"encoding/json"
	"errors"
	"io"

	"hijpass/config/generator"
)

func rpc(method string, in io.Reader) any {
	var req struct {
		Sections *string `json:"sections"`
		Target   string  `json:"target"`
	}
	fail := func(err error) any { return rpcResponse{Error: err.Error()} }
	if method != "render" && method != "validate" {
		return fail(errors.New("unknown method"))
	}
	if err := decodeInput(in, &req); err != nil {
		return fail(err)
	}
	c, err := loadConfig(req.Sections)
	if err != nil {
		return fail(err)
	}
	if method == "validate" {
		if err := generator.Validate(c); err != nil {
			return fail(err)
		}
		return rpcResponse{OK: true}
	}
	out, err := renderConfig(c, req.Target)
	if err != nil {
		return fail(err)
	}
	if req.Target != "" {
		return rpcResponse{Config: out}
	}
	return out
}

type rpcResponse struct {
	Error  string          `json:"error,omitempty"`
	OK     bool            `json:"ok,omitempty"`
	Config json.RawMessage `json:"config,omitempty"`
}
