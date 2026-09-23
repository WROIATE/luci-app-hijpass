package main

import (
	"encoding/json"
	"errors"
	"hijpass/config/feature"
	"os"
)

func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: hijpass-config render (JSON sections on stdin) | list | call METHOD")
	}
	switch os.Args[1] {
	case "list":
		return json.NewEncoder(os.Stdout).Encode(map[string]map[string]string{"render": {"sections": "", "target": ""}, "validate": {"sections": ""}})
	case "call":
		if len(os.Args) != 3 {
			return errors.New("missing RPC method")
		}
		return json.NewEncoder(os.Stdout).Encode(rpc(os.Args[2]))
	case "render":
		var c feature.Config
		if e := decodeInput(os.Stdin, &c); e != nil {
			return e
		}
		out, e := feature.Render(c)
		if e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(out)
	default:
		return errors.New("unknown command")
	}
}
