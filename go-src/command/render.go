package command

import (
	"encoding/json"
	"fmt"

	"hijpass/config/generator"
)

// renderConfig serializes generated configurations at the CLI/RPC boundary.
func renderConfig(c generator.Snapshot, target string) (json.RawMessage, error) {
	if target != "" {
		config, err := generator.RenderTarget(c, target)
		if err != nil {
			return nil, err
		}
		data, err := config.Serialize()
		return json.RawMessage(data), err
	}

	generated, err := generator.Render(c)
	if err != nil {
		return nil, err
	}
	result := struct {
		Nodes map[string]json.RawMessage `json:"nodes"`
		Shunt json.RawMessage            `json:"shunt,omitempty"`
	}{
		Nodes: make(map[string]json.RawMessage, len(generated.Nodes)),
	}
	for name, config := range generated.Nodes {
		data, err := config.Serialize()
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", name, err)
		}
		result.Nodes[name] = data
	}
	if generated.Shunt != nil {
		data, err := generated.Shunt.Serialize()
		if err != nil {
			return nil, fmt.Errorf("shunt: %w", err)
		}
		result.Shunt = data
	}
	data, err := json.Marshal(result)
	return json.RawMessage(data), err
}
