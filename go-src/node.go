package main

import (
	"encoding/json"
	"fmt"
	"time"
)

// proxyNode describes behavior, not a union of every protocol's fields.
// Only concrete protocol types implement protocol validation.
type proxyNode interface {
	base() *nodeBase
	validate() error
}

// Only remote proxies have an endpoint and an upstream; load balancers do not.
type remoteProxyNode interface {
	proxyNode
	endpoint() *nodeServer
}

func (n *nodeBase) base() *nodeBase         { return n }
func (n *nodeServer) endpoint() *nodeServer { return n }

func parseNode(s section) (proxyNode, error) {
	var n proxyNode
	switch s.str("type") {
	case "shadowsocks":
		n = &shadowsocksNode{multiplexOptions: multiplexOptions{MultiplexProtocol: "h2mux"}}
	case "hysteria2":
		n = &hysteria2Node{}
	case "tuic":
		n = &tuicNode{CongestionControl: "cubic", Heartbeat: uciDuration(10 * time.Second)}
	case "shadowtls":
		n = &shadowTLSNode{ShadowTLSVersion: 1}
	case "vless":
		n = &vlessNode{
			Network:          "tcp",
			multiplexOptions: multiplexOptions{MultiplexProtocol: "h2mux"},
			transportOptions: transportOptions{
				HTTPIdle: uciDuration(15 * time.Second), HTTPPing: uciDuration(15 * time.Second),
				GRPCIdle: uciDuration(15 * time.Second), GRPCPing: uciDuration(15 * time.Second),
			},
		}
	case "load_balance":
		n = &loadBalanceNode{
			Strategy: "leastLoad", StrategyExpected: 1,
			StrategyMaxRTT: uciDuration(time.Second), StrategyTolerance: 0.05,
			ProbeURL:      "https://connectivitycheck.gstatic.com/generate_204",
			ProbeInterval: uciDuration(time.Minute),
			ProbeTimeout:  uciDuration(2 * time.Second), ProbeSampling: 3,
		}
	default:
		return nil, fmt.Errorf("unsupported proxy type %q", s.str("type"))
	}
	n.base().LogLevel = "info"
	data, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	// Decode into the selected concrete type. Stale fields from a different UCI
	// protocol are ignored rather than becoming part of this node's model.
	if err = json.Unmarshal(data, n); err != nil {
		return nil, err
	}
	n.base().Core = core(s)
	if err = n.base().validateBase(); err != nil {
		return nil, err
	}
	if remote, ok := n.(remoteProxyNode); ok {
		if err = remote.endpoint().validateServer(); err != nil {
			return nil, err
		}
	}
	if err = n.validate(); err != nil {
		return nil, err
	}
	return n, nil
}
func fallback(s, defaultValue string) string {
	if s == "" {
		return defaultValue
	}
	return s
}
func intValue(v *uciInt) int {
	if v == nil {
		return 0
	}
	return int(*v)
}
