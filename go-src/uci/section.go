package uci

import "strconv"

type Section map[string]any

const (
	SectionName   = ".name"
	SectionType   = ".type"
	OptionName    = "name"
	OptionType    = "type"
	OptionEnabled = "enabled"
	Enabled       = "1"
	Disabled      = "0"
)

func (s Section) String(k string) string { v, _ := s[k].(string); return v }
func (s Section) Value(k, fallback string) string {
	if v := s.String(k); v != "" {
		return v
	}
	return fallback
}
func (s Section) List(k string) []string {
	var out []string
	switch v := s[k].(type) {
	case []any:
		for _, x := range v {
			if t, ok := x.(string); ok && t != "" {
				out = append(out, t)
			}
		}
	case []string:
		out = v
	case string:
		if v != "" {
			out = []string{v}
		}
	}
	return out
}
func (s Section) Number(k string) float64 { v, _ := strconv.ParseFloat(s.String(k), 64); return v }
