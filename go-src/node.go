package main

import (
	"encoding/json"
	"hijpass/config/protocol"
	"hijpass/config/uci"
)

// Adapt raw UCI sections to the protocol package without coupling its models to
// the application's section lookup or core-name normalization.
func parseNode(s section) (protocol.Node, error) {
	data, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	n, err := uci.DecodeNode(data)
	if err != nil {
		return nil, err
	}
	n.Base().Core = core(s)
	return n, nil
}
func fallback(s, defaultValue string) string {
	if s == "" {
		return defaultValue
	}
	return s
}
func intValue(v *int64) int {
	if v == nil {
		return 0
	}
	return int(*v)
}
