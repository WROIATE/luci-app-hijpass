package source

import (
	"strings"

	"hijpass/config/config"
	"hijpass/config/uci"
)

// An absent snapshot selects system UCI. Invalid explicit snapshots never fall back.
func Load(snapshot *string) (config.Snapshot, error) {
	if snapshot == nil {
		sections, err := uci.Load("hijpass")
		return config.Snapshot(sections), err
	}
	var c config.Snapshot
	err := DecodeJSON(strings.NewReader(*snapshot), &c)
	return c, err
}
