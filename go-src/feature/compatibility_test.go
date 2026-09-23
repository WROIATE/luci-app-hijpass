package feature

import (
	"context"
	"encoding/json"
	sb "github.com/sagernet/sing-box/option"
	sj "github.com/sagernet/sing/common/json"
	"github.com/sagernet/sing/service"
	xr "github.com/xtls/xray-core/infra/conf"
	"hijpass/config/core"
	"strings"
	"testing"
)

// Register only schema constructors: no core listeners, runtimes or test hooks in
// production code. Native decoders still check unknown and removed fields.
type optionRegistry map[string]func() any

func (r optionRegistry) OptionTypes() []string {
	var types []string
	for name := range r {
		types = append(types, name)
	}
	return types
}
func (r optionRegistry) CreateOptions(name string) (any, bool) {
	f, ok := r[name]
	if !ok {
		return nil, false
	}
	return f(), true
}
func nativeContext() context.Context {
	ctx := service.ContextWith[sb.InboundOptionsRegistry](context.Background(), optionRegistry{"tproxy": func() any { return &sb.TProxyInboundOptions{} }, "socks": func() any { return &sb.SocksInboundOptions{} }, "direct": func() any { return &sb.DirectInboundOptions{} }})
	ctx = service.ContextWith[sb.OutboundOptionsRegistry](ctx, optionRegistry{"direct": func() any { return &sb.DirectOutboundOptions{} }, "socks": func() any { return &sb.SOCKSOutboundOptions{} }, "shadowsocks": func() any { return &sb.ShadowsocksOutboundOptions{} }, "vless": func() any { return &sb.VLESSOutboundOptions{} }, "tuic": func() any { return &sb.TUICOutboundOptions{} }, "hysteria2": func() any { return &sb.Hysteria2OutboundOptions{} }, "shadowtls": func() any { return &sb.ShadowTLSOutboundOptions{} }, "urltest": func() any { return &sb.URLTestOutboundOptions{} }})
	return service.ContextWith[sb.DNSTransportOptionsRegistry](ctx, optionRegistry{"local": func() any { return &sb.LocalDNSServerOptions{} }, "udp": func() any { return &sb.RemoteDNSServerOptions{} }, "tcp": func() any { return &sb.RemoteDNSServerOptions{} }, "tls": func() any { return &sb.RemoteTLSDNSServerOptions{} }, "quic": func() any { return &sb.RemoteTLSDNSServerOptions{} }, "https": func() any { return &sb.RemoteHTTPSDNSServerOptions{} }})
}
func canonicalCore(t *testing.T, data []byte, co string) any {
	t.Helper()
	var encoded []byte
	var e error
	if co == "xray" {
		x := xr.Config{}
		if e = json.Unmarshal(data, &x); e != nil {
			t.Fatal(e)
		}
		for i := range x.OutboundConfigs {
			out := &x.OutboundConfigs[i]
			if out.Settings == nil {
				continue
			}
			var settings any
			switch out.Protocol {
			case "shadowsocks":
				settings = &xr.ShadowsocksClientConfig{}
			case "vless":
				settings = &xr.VLessOutboundConfig{}
			case "hysteria":
				settings = &xr.HysteriaClientConfig{}
			case "socks":
				settings = &xr.SocksClientConfig{}
			case "freedom":
				settings = &xr.FreedomConfig{}
			case "dns":
				settings = &xr.DNSOutboundConfig{}
			}
			if settings != nil {
				if e = json.Unmarshal(*out.Settings, settings); e != nil {
					t.Fatal(e)
				}
				out.Settings, e = core.RawSettings(settings)
				if e != nil {
					t.Fatal(e)
				}
			}
		}
		for i := range x.InboundConfigs {
			in := &x.InboundConfigs[i]
			var settings any
			switch in.Protocol {
			case "socks":
				settings = &xr.SocksServerConfig{}
			case "dokodemo-door":
				settings = &xr.DokodemoConfig{}
			}
			if settings != nil && in.Settings != nil {
				if e = json.Unmarshal(*in.Settings, settings); e != nil {
					t.Fatal(e)
				}
				in.Settings, e = core.RawSettings(settings)
				if e != nil {
					t.Fatal(e)
				}
			}
		}
		encoded, e = json.Marshal(x)
	} else {
		var options sb.Options
		if e = sj.UnmarshalContext(nativeContext(), data, &options); e != nil {
			t.Fatal(e)
		}
		encoded, e = sj.MarshalContext(nativeContext(), options)
	}
	if e != nil {
		t.Fatal(e)
	}
	var result any
	if e = json.Unmarshal(encoded, &result); e != nil {
		t.Fatal(e)
	}
	return result
}

// Explicitly migrate the frozen TS baseline to the pinned schema. No fixture is
// regenerated from the implementation under test; native serializers normalize
// defaults and scalar/list forms for both sides of the comparison.
func migrateBaseline(raw map[string]any, co string, Shunt bool) {
	if co == "sing-box" {
		var outs []any
		for _, v := range raw["outbounds"].([]any) {
			out := v.(map[string]any)
			if out["type"] == "block" {
				continue
			}
			if tls, ok := out["tls"].(map[string]any); ok {
				if _, ok := tls["reality"]; ok {
					tls["utls"] = map[string]any{"enabled": true, "fingerprint": "chrome"}
				}
			}
			outs = append(outs, out)
		}
		raw["outbounds"] = outs
		if !Shunt {
			route, ok := raw["route"].(map[string]any)
			if !ok {
				route = map[string]any{}
				raw["route"] = route
			}
			route["default_domain_resolver"] = "local"
		}
	} else {
		for _, v := range raw["outbounds"].([]any) {
			out := v.(map[string]any)
			if out["protocol"] == "freedom" {
				settings := out["settings"].(map[string]any)
				strategy := settings["domainStrategy"]
				delete(settings, "domainStrategy")
				out["streamSettings"] = map[string]any{"sockopt": map[string]any{"domainStrategy": strategy}}
			}
		}
		if route, ok := raw["routing"].(map[string]any); ok {
			if rules, ok := route["rules"].([]any); ok {
				for _, v := range rules {
					r := v.(map[string]any)
					if p, ok := r["port"].(string); ok {
						r["port"] = strings.ReplaceAll(p, ":", "-")
					}
				}
			}
		}
	}
}
func compareBaseline(t *testing.T, g Generated, c Config, expected any) {
	t.Helper()
	want := expected.(map[string]any)
	nodes := want["nodes"].(map[string]any)
	if len(g.Nodes) != len(nodes) {
		t.Fatalf("node count changed: %d vs %d", len(g.Nodes), len(nodes))
	}
	for _, s := range c.Of("proxy_node") {
		id := s.String(".name")
		actual, ok := g.Nodes[id]
		if !ok {
			continue
		}
		compareCore(t, actual, nodes[id].(map[string]any), CoreName(s), false)
	}
	if ws, ok := want["shunt"].(map[string]any); ok && len(ws) > 0 {
		if g.Shunt == nil {
			t.Fatal("missing shunt")
		}
		co := c.First("shunt").String("type")
		if co == "singbox" {
			co = "sing-box"
		}
		compareCore(t, g.Shunt, want["shunt"].(map[string]any), co, true)
	} else if g.Shunt != nil {
		t.Fatal("unexpected shunt")
	}
}
func compareCore(t *testing.T, actual *core.Config, baseline map[string]any, co string, Shunt bool) {
	t.Helper()
	migrateBaseline(baseline, co, Shunt)
	want, e := json.Marshal(baseline)
	if e != nil {
		t.Fatal(e)
	}
	got, e := json.Marshal(actual)
	if e != nil {
		t.Fatal(e)
	}
	w := canonicalCore(t, want, co)
	g := canonicalCore(t, got, co)
	wb, _ := json.MarshalIndent(w, "", "  ")
	gb, _ := json.MarshalIndent(g, "", "  ")
	if string(wb) != string(gb) {
		t.Errorf("native output differs from migrated TypeScript baseline\nwant: %s\ngot: %s", wb, gb)
	}
}
