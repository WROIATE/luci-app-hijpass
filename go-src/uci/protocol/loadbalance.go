package protocol

import (
	"fmt"
	"time"

	"hijpass/config/uci"
	"hijpass/config/uci/constant"
)

// LoadBalance contains only the options supported by this proxy type.
type LoadBalance struct {
	BaseOptions
	Members              []Config // Linked in UCI member order by the generator.
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

func init() { register("load_balance", func() Config { return newLoadBalance() }) }

// DecodeUCI reads only options supported by LoadBalance.
func (n *LoadBalance) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)

	d.Text(constant.OptionURL, &n.URL)
	d.Duration(constant.OptionInterval, &n.Interval)
	d.Integer(constant.OptionTolerance, &n.Tolerance)
	d.Duration(constant.OptionIdleTimeout, &n.IdleTimeout)
	d.Boolean(constant.OptionInterruptExistingConnections, &n.InterruptConnections)
	d.Text(constant.OptionStrategy, &n.Strategy)
	d.Integer(constant.OptionStrategyExpected, &n.StrategyExpected)
	d.Duration(constant.OptionStrategyMaxRTT, &n.StrategyMaxRTT)
	d.Number(constant.OptionStrategyTolerance, &n.StrategyTolerance)
	d.Text(constant.OptionFallbackTag, &n.Fallback)
	d.Text(constant.OptionProbeURL, &n.ProbeURL)
	d.Text(constant.OptionProbeConnectivity, &n.ProbeConnectivity)
	d.Duration(constant.OptionProbeInterval, &n.ProbeInterval)
	d.Duration(constant.OptionProbeTimeout, &n.ProbeTimeout)
	d.Integer(constant.OptionProbeSampling, &n.ProbeSampling)
	d.Text(constant.OptionProbeHTTPMethod, &n.ProbeMethod)
	return d.Err()
}
