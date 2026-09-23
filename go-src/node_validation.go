package main

import (
	"fmt"
	"math"
	"time"
)

func (n nodeBase) validateBase() error {
	for _, p := range []struct {
		name  string
		value uciInt
	}{{"listen_port", n.ListenPort}, {"socks_port", n.SocksPort}} {
		if p.value < 1 || p.value > 65535 {
			return fmt.Errorf("invalid %s", p.name)
		}
	}
	return nil
}
func (n nodeServer) validateServer() error {
	if n.Server == "" || n.ServerPort < 1 || n.ServerPort > 65535 {
		return fmt.Errorf("invalid server or server_port")
	}
	return nil
}

// Keep integer conversions consistent on 32- and 64-bit routers.
func validateInt32(values ...uciInt) error {
	for _, v := range values {
		if v > math.MaxInt32 {
			return fmt.Errorf("integer option exceeds 32-bit range")
		}
	}
	return nil
}
func (n multiplexOptions) validateMultiplex() error {
	return validateInt32(n.MaxConnections, n.MinStreams, n.MaxStreams, n.BrutalUp, n.BrutalDown)
}
func (n transportOptions) validateTransport() error {
	if uint64(n.WSEarlyData) > math.MaxUint32 {
		return fmt.Errorf("numeric option out of range")
	}
	for _, v := range []uciDuration{n.GRPCIdle, n.GRPCPing} {
		if time.Duration(v)/time.Second > math.MaxInt32 {
			return fmt.Errorf("gRPC timeout exceeds 32-bit range")
		}
	}
	return nil
}
func (n *shadowsocksNode) validate() error { return n.validateMultiplex() }
func (n *hysteria2Node) validate() error {
	for _, v := range []*uciInt{n.UpMbps, n.DownMbps} {
		if v != nil && *v > math.MaxInt32 {
			return fmt.Errorf("bandwidth exceeds 32-bit range")
		}
	}
	return nil
}
func (n *tuicNode) validate() error      { return nil }
func (n *shadowTLSNode) validate() error { return validateInt32(n.ShadowTLSVersion) }
func (n *vlessNode) validate() error {
	if e := n.validateMultiplex(); e != nil {
		return e
	}
	return n.validateTransport()
}
func (n *loadBalanceNode) validate() error {
	if n.Tolerance > 65535 {
		return fmt.Errorf("numeric option out of range")
	}
	return validateInt32(n.StrategyExpected, n.ProbeSampling)
}
