package uci

import (
	"fmt"
	"strconv"
)

func ValidatePort(s Section, k string) error {
	n, err := strconv.Atoi(s.String(k))
	if err != nil || n < 1 || n > 65535 {
		return fmt.Errorf("%s: invalid %s", s.Value("name", s.String(".name")), k)
	}
	return nil
}
