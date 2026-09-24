package routing

import (
	"encoding/json"

	"hijpass/config/core"
	"hijpass/config/dns"
	"hijpass/config/proxy"
	"hijpass/config/routing/match"

	sb "github.com/sagernet/sing-box/option"
)

type builder struct {
	config   *core.Config
	settings Settings
	dns      *dns.Plan
	xrRoutes []core.XrayRouteRule
	setIndex map[string]int
}

func newBuilder(nodes *proxy.Catalog, s Settings, final, resolver string, servers dns.Catalog) (*builder, error) {
	b := &builder{config: &core.Config{}, settings: s, setIndex: map[string]int{}}
	var err error
	if s.Core == "sing-box" {
		err = buildSingBox(b, nodes, s, final, resolver, servers)
	} else {
		err = buildXray(b, nodes, s, final)
	}
	if err != nil {
		return nil, err
	}
	b.dns = dns.NewPlan(b.config, servers, resolver)
	return b, nil
}
func (b *builder) addSet(set sb.RuleSet) {
	if set.Type == "remote" && b.settings.RuleSetProxy != "" {
		set.RemoteOptions.HTTPClient = &sb.HTTPClientOptions{DialerOptions: sb.DialerOptions{Detour: "ruleset-out"}}
	}
	tag := set.Tag[0]
	sets := &b.config.SingBox.Route.RuleSet
	if i, ok := b.setIndex[tag]; ok {
		(*sets)[i] = set
	} else {
		b.setIndex[tag] = len(*sets)
		*sets = append(*sets, set)
	}
}
func (b *builder) addSingBoxRule(r match.Rule, out string, version int) {
	match := r.SingBox()
	match.IPVersion = version
	action := sb.RuleAction{Action: "route", RouteOptions: sb.RouteActionOptions{Outbound: out}}
	if out == "block" {
		action = sb.RuleAction{Action: "reject"}
	}
	b.config.SingBox.Route.Rules = append(b.config.SingBox.Route.Rules, sb.Rule{Type: "default", DefaultOptions: sb.DefaultRule{RawDefaultRule: match, RuleAction: action}})
}

func (b *builder) finish() (*core.Config, error) {
	routes, err := b.dns.Finish()
	if err != nil {
		return nil, err
	}
	if x := b.config.Xray; x != nil {
		for _, r := range append(routes, b.xrRoutes...) {
			data, err := json.Marshal(r)
			if err != nil {
				return nil, err
			}
			x.RouterConfig.RuleList = append(x.RouterConfig.RuleList, data)
		}
	}
	return b.config, nil
}
