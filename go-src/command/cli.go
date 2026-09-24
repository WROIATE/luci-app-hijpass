package command

import (
	"encoding/json"
	"errors"
	"flag"
	"io"

	"hijpass/config/generator"
	"hijpass/config/source"
)

// Run dispatches the CLI and rpcd entry points.
func Run(args []string, in io.Reader, out io.Writer) error {
	if len(args) == 0 {
		return errors.New("usage: hijpass-config render [--stdin] [--target SECTION] | list | call METHOD")
	}
	switch args[0] {
	case "list":
		return json.NewEncoder(out).Encode(map[string]map[string]string{"render": {"sections": "", "target": ""}, "validate": {"sections": ""}})
	case "call":
		if len(args) != 2 {
			return errors.New("missing RPC method")
		}
		return json.NewEncoder(out).Encode(rpc(args[1], in))
	case "render":
		flags := flag.NewFlagSet("render", flag.ContinueOnError)
		flags.SetOutput(io.Discard)
		stdin := flags.Bool("stdin", false, "read a JSON section snapshot instead of system UCI")
		target := flags.String("target", "", "render one section or shunt")
		if err := flags.Parse(args[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return errors.New("unexpected render arguments")
		}
		var snapshot *string
		if *stdin {
			var raw json.RawMessage
			if err := source.DecodeJSON(in, &raw); err != nil {
				return err
			}
			s := string(raw)
			snapshot = &s
		}
		c, err := source.Load(snapshot)
		if err != nil {
			return err
		}
		var result any
		if *target != "" {
			result, err = generator.RenderTarget(c, *target)
		} else {
			result, err = generator.Render(c)
		}
		if err != nil {
			return err
		}
		return json.NewEncoder(out).Encode(result)
	default:
		return errors.New("unknown command")
	}
}
