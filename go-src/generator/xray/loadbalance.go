package xray

import (
	"encoding/json"
	"fmt"
	"time"

	"hijpass/config/generator/protocol"
	"hijpass/config/generator/wire"

	xr "github.com/xtls/xray-core/infra/conf"
	"github.com/xtls/xray-core/infra/conf/cfgcommon/duration"
)

type xrayLeastLoad struct {
	Expected  int64   `json:"expected"`
	MaxRTT    string  `json:"maxRTT"`
	Tolerance float64 `json:"tolerance"`
}

func buildLoadBalance(x *xr.Config, n *protocol.LoadBalance) error {

	fb := wire.LoadBalanceMemberPrefix + "0"
	for i, member := range n.Members {
		port := member.Base().SocksPort
		tag := fmt.Sprintf("%s%d", wire.LoadBalanceMemberPrefix, i)
		if member.Base().Name == n.Fallback {
			fb = tag
		}
		o, e := Socks(tag, port)
		if e != nil {
			return e
		}
		x.OutboundConfigs = append(x.OutboundConfigs, o)
	}
	strategy := xr.StrategyConfig{Type: n.Strategy}
	if n.Strategy == "leastLoad" {
		s, e := RawSettings(xrayLeastLoad{
			Expected:  n.StrategyExpected,
			MaxRTT:    time.Duration(n.StrategyMaxRTT).String(),
			Tolerance: n.StrategyTolerance,
		})
		if e != nil {
			return e
		}
		strategy.Settings = s
	}
	rr, e := json.Marshal(XrayRouteRule{
		InboundTag:  []string{wire.TProxyInbound, wire.SocksInbound},
		BalancerTag: wire.LoadBalance,
	})
	if e != nil {
		return e
	}
	x.RouterConfig = &xr.RouterConfig{
		DomainStrategy: new(domainStrategyAsIs),
		RuleList:       []json.RawMessage{rr},
		Balancers: []*xr.BalancingRule{
			{
				Tag:         wire.LoadBalance,
				Selectors:   xr.StringList{wire.LoadBalanceMemberPrefix},
				FallbackTag: fb,
				Strategy:    strategy,
			},
		},
	}
	x.BurstObservatory = &xr.BurstObservatoryConfig{
		SubjectSelector: []string{wire.LoadBalanceMemberPrefix},
		HealthCheck: &xr.HealthCheckSettings{
			Destination:   n.ProbeURL,
			Connectivity:  n.ProbeConnectivity,
			Interval:      duration.Duration(n.ProbeInterval),
			Timeout:       duration.Duration(n.ProbeTimeout),
			SamplingCount: int(n.ProbeSampling),
			HttpMethod:    n.ProbeMethod,
		},
	}
	return nil
}
