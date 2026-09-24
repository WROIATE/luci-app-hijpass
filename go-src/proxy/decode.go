package proxy

import (
	"encoding/json"

	"hijpass/config/protocol"
	"hijpass/config/uci"
)

// Adapt raw UCI sections to the protocol package without coupling its models to
// the application's section lookup or core-name normalization.
func Decode(s uci.Section) (protocol.Config, error) {
	data, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	n, err := protocol.Decode(data)
	if err != nil {
		return nil, err
	}
	n.Base().Core = CoreName(s)
	return n, nil
}
