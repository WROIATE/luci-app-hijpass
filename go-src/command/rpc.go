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
	if req.Target != "" {
		o, err := generator.RenderTarget(c, req.Target)
		if err != nil {
			return fail(err)
		}
		return rpcResponse{Config: o}
	}
	out, err := generator.Render(c)
	if err != nil {
		return fail(err)
	}
	return out
}

type rpcResponse struct {
	Error  string         `json:"error,omitempty"`
	OK     bool           `json:"ok,omitempty"`
	Config json.Marshaler `json:"config,omitempty"`
}
