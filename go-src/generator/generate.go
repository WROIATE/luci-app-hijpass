package generator

import (
	"encoding/json"
	"errors"
	"fmt"

	"hijpass/config/uci/constant"
	"hijpass/config/uci/protocol"
)

type Generated struct {
	Nodes map[string]json.Marshaler `json:"nodes"`
	Shunt json.Marshaler            `json:"shunt,omitempty"`
}

// preparedConfig holds a decoded, linked and prechecked generation scope.
type preparedConfig struct {
	nodes   []protocol.Config
	routing *routingConfig
}

func prepare(c Snapshot, target string) (*preparedConfig, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	sections := c.Of(sectionProxyNode)
	var roots Snapshot
	switch target {
	case "", sectionShunt:
		for _, s := range sections {
			if s.String(constant.OptionEnabled) == constant.Enabled {
				roots = append(roots, s)
			}
		}
	default:
		for _, s := range sections {
			if s.String(constant.SectionName) == target {
				roots = append(roots, s)
				break
			}
		}
		if len(roots) == 0 {
			return nil, errors.New("node not found")
		}
	}
	nodes, err := resolveProxies(sections, roots)
	if err != nil {
		return nil, err
	}
	if err := validateDependencies(nodes...); err != nil {
		return nil, err
	}
	result := &preparedConfig{nodes: nodes}
	shunt := c.First(sectionShunt)
	if target == sectionShunt || target == "" && shunt.String(constant.OptionEnabled) != constant.Disabled && shunt.String(constant.OptionConfigType) == configTypeTemplate {
		result.routing, err = prepareRouting(c, nodes)
		if err != nil {
			return nil, err
		}
	}
	var routing *routingSettings
	if result.routing != nil {
		routing = &result.routing.settings
	}
	if err := validateListenPorts(nodes, routing); err != nil {
		return nil, err
	}
	return result, nil
}

// buildPrepared runs each selected node through its own core builder, including
// dependencies of a preview. This keeps core compatibility checks in one place.
func buildPrepared(c *preparedConfig) (Generated, error) {
	out := Generated{Nodes: map[string]json.Marshaler{}}
	for _, node := range c.nodes {
		if _, custom := node.(*protocol.Custom); custom {
			continue
		}
		config, err := buildProxy(node)
		if err != nil {
			return Generated{}, fmt.Errorf("node %q: %w", node.Base().Name, err)
		}
		out.Nodes[node.Base().ID] = config
	}
	if c.routing != nil {
		config, err := buildRouting(c.nodes, c.routing)
		if err != nil {
			return Generated{}, err
		}
		out.Shunt = config
	}
	return out, nil
}

func Render(c Snapshot) (Generated, error) {
	prepared, err := prepare(c, "")
	if err != nil {
		return Generated{}, err
	}
	return buildPrepared(prepared)
}

// RenderTarget checks the target and its reachable dependencies. A shunt preview
// includes every enabled proxy because all are emitted as local SOCKS outbounds.
func RenderTarget(c Snapshot, target string) (json.Marshaler, error) {
	if target == "" {
		return nil, errors.New("node not found")
	}
	prepared, err := prepare(c, target)
	if err != nil {
		return nil, err
	}
	generated, err := buildPrepared(prepared)
	if err != nil {
		return nil, err
	}
	if target == sectionShunt {
		return generated.Shunt, nil
	}
	if output := generated.Nodes[target]; output != nil {
		return output, nil
	}
	return nil, errors.New("custom node configuration is not generated")
}

// Validate uses the generation path so it also checks core-specific constraints.
// Disabling the service still permits saving unfinished protocol configurations.
func Validate(c Snapshot) error {
	if c.First(sectionService).String(constant.OptionEnabled) == constant.Disabled {
		return c.Validate()
	}
	_, err := Render(c)
	return err
}
