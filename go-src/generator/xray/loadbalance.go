package xray

import (
	"encoding/json"
	"fmt"
	"time"

	"hijpass/config/generator/protocol"

	xr "github.com/xtls/xray-core/infra/conf"
)

// Xray's healthCheckSettings is private. Decode a typed wire adapter into the
// native BurstObservatoryConfig rather than constructing untyped JSON objects.
type xrayBurstOptions struct {
	SubjectSelector []string `json:"subjectSelector"`
	PingConfig      xrayPing `json:"pingConfig"`
}
type xrayPing struct {
	Destination  string `json:"destination"`
	Connectivity string `json:"connectivity,omitempty"`
	Interval     string `json:"interval"`
	Timeout      string `json:"timeout"`
	Sampling     int64  `json:"sampling"`
	HTTPMethod   string `json:"httpMethod,omitempty"`
}
type xrayLeastLoad struct {
	Expected  int64   `json:"expected"`
	MaxRTT    string  `json:"maxRTT"`
	Tolerance float64 `json:"tolerance"`
}

func buildLoadBalance(x *xr.Config, n *protocol.LoadBalance) error {

	fb := "lb-member-0"
	for i, member := range n.Members {
		port := uint16(member.Base().SocksPort)
		tag := fmt.Sprintf("lb-member-%d", i)
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
			Tolerance: float64(n.StrategyTolerance),
		})
		if e != nil {
			return e
		}
		strategy.Settings = s
	}
	rr, e := json.Marshal(XrayRouteRule{
		InboundTag:  []string{"tproxy-in", "socks-in"},
		BalancerTag: "slb",
	})
	if e != nil {
		return e
	}
	x.RouterConfig = &xr.RouterConfig{
		DomainStrategy: new("AsIs"),
		RuleList:       []json.RawMessage{rr},
		Balancers: []*xr.BalancingRule{
			{
				Tag:         "slb",
				Selectors:   xr.StringList{"lb-member-"},
				FallbackTag: fb,
				Strategy:    strategy,
			},
		},
	}
	burst := xrayBurstOptions{
		SubjectSelector: []string{"lb-member-"},
		PingConfig: xrayPing{
			Destination:  n.ProbeURL,
			Connectivity: n.ProbeConnectivity,
			Interval:     time.Duration(n.ProbeInterval).String(),
			Timeout:      time.Duration(n.ProbeTimeout).String(),
			Sampling:     n.ProbeSampling,
			HTTPMethod:   n.ProbeMethod,
		},
	}
	data, e := json.Marshal(burst)
	if e != nil {
		return e
	}
	x.BurstObservatory = &xr.BurstObservatoryConfig{}
	if e = json.Unmarshal(data, x.BurstObservatory); e != nil {
		return e
	}
	return nil
}
