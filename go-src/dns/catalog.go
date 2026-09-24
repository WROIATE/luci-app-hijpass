package dns

import (
	"fmt"

	"hijpass/config/uci"
)

// Server is independent of the UCI representation and native core schemas.
type Server struct {
	Type, Address string
	Port          uint16
}
type Catalog map[string]*Server

func Decode(sections []uci.Section) (Catalog, error) {
	out := Catalog{}
	for _, s := range sections {
		if s.String("enabled") == "0" {
			continue
		}
		tag := s.String("tag")
		if _, ok := out[tag]; ok {
			return nil, fmt.Errorf("duplicate DNS tag %q", tag)
		}
		if s.String("port") != "" {
			if err := uci.ValidatePort(s, "port"); err != nil {
				return nil, err
			}
		}
		out[tag] = &Server{Type: s.String("type"), Address: s.String("server"), Port: uint16(s.Number("port"))}
	}
	return out, nil
}

// Policy selects the DNS server and strategy for a routing rule.
type Policy struct{ Server, Strategy string }
