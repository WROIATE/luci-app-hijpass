package routing

import (
	"fmt"
	"strconv"

	"hijpass/config/uci"
)

// Reject invalid ports before conversion to the native uint16 representation.
func validateRulePorts(s uci.Section) error {
	for _, p := range s.List("port") {
		n, e := strconv.Atoi(p)
		if e != nil || n < 1 || n > 65535 {
			return fmt.Errorf("invalid rule port %q", p)
		}
	}
	return nil
}
