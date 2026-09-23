package main

import (
	"encoding/json"
	"fmt"
	"math"
	"time"
)

// proxyNode is the UCI decode boundary, assembled from focused option groups.
// Shared server and credential fields appear only once to avoid ambiguous JSON
// tags when protocols use the same UCI key.
type proxyNode struct {
	nodeBase
	nodeServer
	nodeCredentials
	shadowsocksOptions
	hysteriaOptions
	tuicOptions
	shadowTLSOptions
	vlessOptions
	tlsOptions
	multiplexOptions
	transportOptions
	loadBalanceOptions
	probeOptions
}

func parseNode(s section) (proxyNode, error) {
	n := proxyNode{
		nodeBase:         nodeBase{Core: core(s), LogLevel: "info"},
		multiplexOptions: multiplexOptions{MultiplexProtocol: "h2mux"},
		loadBalanceOptions: loadBalanceOptions{
			Strategy: "leastLoad", StrategyExpected: 1,
			StrategyMaxRTT: uciDuration(time.Second), StrategyTolerance: 0.05,
		},
		probeOptions: probeOptions{
			ProbeURL:      "https://connectivitycheck.gstatic.com/generate_204",
			ProbeInterval: uciDuration(time.Minute),
			ProbeTimeout:  uciDuration(2 * time.Second), ProbeSampling: 3,
		},
	}
	switch s.str("type") {
	case "vless":
		n.Network = "tcp"
		n.HTTPIdle = uciDuration(15 * time.Second)
		n.HTTPPing = n.HTTPIdle
		n.GRPCIdle = n.HTTPIdle
		n.GRPCPing = n.HTTPIdle
	case "tuic":
		n.CongestionControl = "cubic"
		n.Heartbeat = uciDuration(10 * time.Second)
	case "shadowtls":
		n.ShadowTLSVersion = 1
	}
	b, e := json.Marshal(s)
	if e != nil {
		return n, e
	}
	if e = json.Unmarshal(b, &n); e != nil {
		return n, e
	}
	n.Core = core(s)
	for _, p := range []struct {
		name  string
		value uciInt
	}{{"listen_port", n.ListenPort}, {"socks_port", n.SocksPort}} {
		if p.value < 1 || p.value > 65535 {
			return n, fmt.Errorf("invalid %s", p.name)
		}
	}
	if n.Type != "load_balance" && (n.Server == "" || n.ServerPort < 1 || n.ServerPort > 65535) {
		return n, fmt.Errorf("invalid server or server_port")
	}
	if n.Tolerance > 65535 || uint64(n.WSEarlyData) > 4294967295 {
		return n, fmt.Errorf("numeric option out of range")
	}
	// The same UCI must have the same interpretation on 32- and 64-bit routers.
	for _, value := range []uciInt{n.MaxConnections, n.MinStreams, n.MaxStreams, n.BrutalUp, n.BrutalDown, n.ShadowTLSVersion, n.StrategyExpected, n.ProbeSampling} {
		if value > math.MaxInt32 {
			return n, fmt.Errorf("integer option exceeds 32-bit range")
		}
	}
	for _, value := range []*uciInt{n.UpMbps, n.DownMbps} {
		if value != nil && *value > math.MaxInt32 {
			return n, fmt.Errorf("bandwidth exceeds 32-bit range")
		}
	}
	for _, value := range []uciDuration{n.GRPCIdle, n.GRPCPing} {
		if time.Duration(value)/time.Second > math.MaxInt32 {
			return n, fmt.Errorf("gRPC timeout exceeds 32-bit range")
		}
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
