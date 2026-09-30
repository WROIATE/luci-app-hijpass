package protocol

import (
	"time"

	"hijpass/config/uci"
	"hijpass/config/uci/constant"
)

// BaseOptions Shared capabilities are embedded only by protocols that support them.
type BaseOptions struct {
	ID         string
	Name       string
	Type       string
	Core       string
	ListenPort uint16
	SocksPort  uint16
	LogLevel   string
}

type ServerOptions struct {
	Server     string
	ServerPort uint16
	Upstream   Config // Linked by the generator after decoding.
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

func (n *BaseOptions) decodeUCI(d *uci.Decoder) {
	d.Text(constant.SectionName, &n.ID)
	d.Text(constant.OptionName, &n.Name)
	d.Text(constant.OptionType, &n.Type)
	d.Text(constant.OptionCore, &n.Core)
	d.Port(constant.OptionListenPort, &n.ListenPort)
	d.Port(constant.OptionSocksPort, &n.SocksPort)
	d.Text(constant.OptionLogLevel, &n.LogLevel)
}

func (n *ServerOptions) decodeUCI(d *uci.Decoder) {
	d.Text(constant.OptionServer, &n.Server)
	d.Port(constant.OptionServerPort, &n.ServerPort)
}

func (n *TLSOptions) decodeUCI(d *uci.Decoder) {
	d.Text(constant.OptionTLSServerName, &n.TLSServerName)
	d.Boolean(constant.OptionTLSInsecure, &n.TLSInsecure)
}

func (n *RealityOptions) decodeUCI(d *uci.Decoder) {
	d.Boolean(constant.OptionTLSRealityEnabled, &n.RealityEnabled)
	d.Text(constant.OptionTLSRealityPublicKey, &n.RealityPublicKey)
	d.Text(constant.OptionTLSRealityShortID, &n.RealityShortID)
}

func (n *MultiplexOptions) decodeUCI(d *uci.Decoder) {
	d.Boolean(constant.OptionMultiplexEnabled, &n.MultiplexEnabled)
	d.Text(constant.OptionMultiplexProtocol, &n.MultiplexProtocol)
	d.Integer(constant.OptionMultiplexMaxConnections, &n.MaxConnections)
	d.Integer(constant.OptionMultiplexMinStreams, &n.MinStreams)
	d.Integer(constant.OptionMultiplexMaxStreams, &n.MaxStreams)
	d.Boolean(constant.OptionMultiplexBrutalEnabled, &n.BrutalEnabled)
	d.Integer(constant.OptionMultiplexBrutalUpMbps, &n.BrutalUp)
	d.Integer(constant.OptionMultiplexBrutalDownMbps, &n.BrutalDown)
}

func (n *TransportOptions) decodeUCI(d *uci.Decoder) {
	d.Text(constant.OptionTransportType, &n.Transport)
	d.Text(constant.OptionTransportHTTPHost, &n.HTTPHost)
	d.Text(constant.OptionTransportHTTPPath, &n.HTTPPath)
	d.Text(constant.OptionTransportHTTPMethod, &n.HTTPMethod)
	d.Duration(constant.OptionTransportHTTPIdleTimeout, &n.HTTPIdle)
	d.Duration(constant.OptionTransportHTTPPingTimeout, &n.HTTPPing)
	d.Text(constant.OptionTransportWSHost, &n.WSHost)
	d.Text(constant.OptionTransportWSPath, &n.WSPath)
	d.Integer(constant.OptionTransportWSMaxEarlyData, &n.WSEarlyData)
	d.Text(constant.OptionTransportWSEarlyDataHeaderName, &n.WSEarlyHeader)
	d.Text(constant.OptionTransportGRPCServiceName, &n.GRPCService)
	d.Duration(constant.OptionTransportGRPCIdleTimeout, &n.GRPCIdle)
	d.Duration(constant.OptionTransportGRPCPingTimeout, &n.GRPCPing)
	d.Boolean(constant.OptionTransportGRPCPermitWithoutStream, &n.GRPCPermit)
	d.Text(constant.OptionTransportHTTPUpgradeHost, &n.UpgradeHost)
	d.Text(constant.OptionTransportHTTPUpgradePath, &n.UpgradePath)
	d.Text(constant.OptionTransportXHTTPHost, &n.XHTTPHost)
	d.Text(constant.OptionTransportXHTTPPath, &n.XHTTPPath)
	d.Text(constant.OptionTransportXHTTPMode, &n.XHTTPMode)
}
