package protocol

import (
	"fmt"
	"time"
)

// LoadBalance contains only the options supported by this proxy type.
type LoadBalance struct {
	BaseOptions
	Members              StringList `json:"member_node"`
	URL                  string     `json:"url"`
	Interval             Duration   `json:"interval"`
	Tolerance            Int        `json:"tolerance"`
	IdleTimeout          Duration   `json:"idle_timeout"`
	InterruptConnections Bool       `json:"interrupt_exist_connections"`
	Strategy             string     `json:"strategy"`
	StrategyExpected     Int        `json:"strategy_expected"`
	StrategyMaxRTT       Duration   `json:"strategy_max_rtt"`
	StrategyTolerance    Float      `json:"strategy_tolerance"`
	Fallback             string     `json:"fallback_tag"`
	ProbeURL             string     `json:"probe_url"`
	ProbeConnectivity    string     `json:"probe_connectivity"`
	ProbeInterval        Duration   `json:"probe_interval"`
	ProbeTimeout         Duration   `json:"probe_timeout"`
	ProbeSampling        Int        `json:"probe_sampling"`
	ProbeMethod          string     `json:"probe_http_method"`
}

func (n *LoadBalance) Validate() error {
	if n.Tolerance > 65535 {
		return fmt.Errorf("numeric option out of range")
	}
	return validateInt32(n.StrategyExpected, n.ProbeSampling)
}

func newLoadBalance() *LoadBalance {
	return &LoadBalance{
		Strategy: "leastLoad", StrategyExpected: 1, StrategyMaxRTT: Duration(time.Second), StrategyTolerance: 0.05,
		ProbeURL: "https://connectivitycheck.gstatic.com/generate_204", ProbeInterval: Duration(time.Minute), ProbeTimeout: Duration(2 * time.Second), ProbeSampling: 3,
	}
}
