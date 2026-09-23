package protocol

import (
	"fmt"
	"time"
)

// LoadBalance contains only the options supported by this proxy type.
type LoadBalance struct {
	BaseOptions
	Members              []string
	URL                  string
	Interval             time.Duration
	Tolerance            int64
	IdleTimeout          time.Duration
	InterruptConnections bool
	Strategy             string
	StrategyExpected     int64
	StrategyMaxRTT       time.Duration
	StrategyTolerance    float64
	Fallback             string
	ProbeURL             string
	ProbeConnectivity    string
	ProbeInterval        time.Duration
	ProbeTimeout         time.Duration
	ProbeSampling        int64
	ProbeMethod          string
}

func (n *LoadBalance) Validate() error {
	if n.Tolerance > 65535 {
		return fmt.Errorf("numeric option out of range")
	}
	return validateInt32(n.StrategyExpected, n.ProbeSampling)
}

func newLoadBalance() *LoadBalance {
	return &LoadBalance{
		Strategy: "leastLoad", StrategyExpected: 1, StrategyMaxRTT: time.Second, StrategyTolerance: 0.05,
		ProbeURL: "https://connectivitycheck.gstatic.com/generate_204", ProbeInterval: time.Minute, ProbeTimeout: 2 * time.Second, ProbeSampling: 3,
	}
}
