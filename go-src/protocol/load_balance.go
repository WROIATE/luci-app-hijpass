package protocol

import (
	"fmt"
	"hijpass/config/uci"
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

func init() { register("load_balance", func() Node { return newLoadBalance() }) }

// DecodeUCI reads only options supported by LoadBalance.
func (n *LoadBalance) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)

	d.List("member_node", &n.Members)
	d.Text("url", &n.URL)
	d.Duration("interval", &n.Interval)
	d.Integer("tolerance", &n.Tolerance)
	d.Duration("idle_timeout", &n.IdleTimeout)
	d.Boolean("interrupt_exist_connections", &n.InterruptConnections)
	d.Text("strategy", &n.Strategy)
	d.Integer("strategy_expected", &n.StrategyExpected)
	d.Duration("strategy_max_rtt", &n.StrategyMaxRTT)
	d.Number("strategy_tolerance", &n.StrategyTolerance)
	d.Text("fallback_tag", &n.Fallback)
	d.Text("probe_url", &n.ProbeURL)
	d.Text("probe_connectivity", &n.ProbeConnectivity)
	d.Duration("probe_interval", &n.ProbeInterval)
	d.Duration("probe_timeout", &n.ProbeTimeout)
	d.Integer("probe_sampling", &n.ProbeSampling)
	d.Text("probe_http_method", &n.ProbeMethod)
	return d.Err()
}
