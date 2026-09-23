package protocol

import "time"

// BaseOptions Shared capabilities are embedded only by protocols that support them.
type BaseOptions struct {
	ID         string
	Name       string
	Type       string
	Core       string
	ListenPort int64
	SocksPort  int64
	LogLevel   string
}

type ServerOptions struct {
	Server     string
	ServerPort int64
	Upstream   string
}

type TLSOptions struct {
	TLSServerName string
	TLSInsecure   bool
}

type RealityOptions struct {
	RealityEnabled   bool
	RealityPublicKey string
	RealityShortID   string
}

type MultiplexOptions struct {
	MultiplexEnabled  bool
	MultiplexProtocol string
	MaxConnections    int64
	MinStreams        int64
	MaxStreams        int64
	BrutalEnabled     bool
	BrutalUp          int64
	BrutalDown        int64
}

type TransportOptions struct {
	Transport     string
	HTTPHost      string
	HTTPPath      string
	HTTPMethod    string
	HTTPIdle      time.Duration
	HTTPPing      time.Duration
	WSHost        string
	WSPath        string
	WSEarlyData   int64
	WSEarlyHeader string
	GRPCService   string
	GRPCIdle      time.Duration
	GRPCPing      time.Duration
	GRPCPermit    bool
	UpgradeHost   string
	UpgradePath   string
	XHTTPHost     string
	XHTTPPath     string
	XHTTPMode     string
}
