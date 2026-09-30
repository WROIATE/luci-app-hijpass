package protocol

import (
	"fmt"
	"math"
	"time"

	"hijpass/config/uci/constant"
)

func (n *BaseOptions) validateBase() error {
	for _, p := range []struct {
		name  string
		value uint16
	}{{constant.OptionListenPort, n.ListenPort}, {constant.OptionSocksPort, n.SocksPort}} {
		if p.value == 0 {
			return fmt.Errorf("invalid %s", p.name)
		}
	}
	return nil
}

func (n *ServerOptions) validateServer() error {
	if n.Server == "" || n.ServerPort == 0 {
		return fmt.Errorf("invalid server or server_port")
	}
	return nil
}

func validateInt32(values ...int64) error {
	for _, v := range values {
		if v > math.MaxInt32 {
			return fmt.Errorf("integer option exceeds 32-bit range")
		}
	}
	return nil
}

func (n *MultiplexOptions) validateMultiplex() error {
	return validateInt32(n.MaxConnections, n.MinStreams, n.MaxStreams, n.BrutalUp, n.BrutalDown)
}

func (n *TransportOptions) validateTransport() error {
	if uint64(n.WSEarlyData) > math.MaxUint32 {
		return fmt.Errorf("numeric option out of range")
	}
	for _, v := range []time.Duration{n.GRPCIdle, n.GRPCPing} {
		if v/time.Second > math.MaxInt32 {
			return fmt.Errorf("gRPC timeout exceeds 32-bit range")
		}
	}
	return nil
}
