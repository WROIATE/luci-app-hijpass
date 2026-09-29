package uci

import (
	"fmt"
)

// Port returns a validated port with its section and option in any error.
func (s Section) Port(k string) (uint16, error) {
	port, err := ParsePort(s.String(k))
	if err != nil {
		return 0, fmt.Errorf("%s: invalid %s", s.Value(OptionName, s.String(SectionName)), k)
	}
	return port, nil
}
