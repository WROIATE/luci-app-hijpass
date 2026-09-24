package command

import (
	"encoding/json"
	"errors"
	"io"
	"strings"

	"hijpass/config/generator"
	"hijpass/config/uci"
)

const maxInput = 4 << 20

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

// An absent snapshot selects system UCI. Invalid explicit snapshots never fall back.
func loadConfig(snapshot *string) (generator.Snapshot, error) {
	if snapshot == nil {
		sections, err := uci.Load("hijpass")
		return generator.Snapshot(sections), err
	}
	var c generator.Snapshot
	err := decodeInput(strings.NewReader(*snapshot), &c)
	return c, err
}
