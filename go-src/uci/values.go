package uci

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"
)

// UCI's numeric/boolean options are strings on the wire. Decode them once at the
// boundary so builders operate on typed fields and cannot silently truncate ports.
type integer int64

type port uint16

// ParsePort converts a UCI decimal port without narrowing an out-of-range value.
func ParsePort(s string) (uint16, error) {
	n, err := strconv.ParseUint(s, 10, 16)
	if err != nil || n == 0 {
		return 0, fmt.Errorf("invalid port %q", s)
	}
	return uint16(n), nil
}

func (v *port) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	if s == "" {
		*v = 0 // The protocol validator reports missing required ports.
		return nil
	}
	n, err := ParsePort(s)
	if err != nil {
		return err
	}
	*v = port(n)
	return nil
}

func (v *integer) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s == "" {
		*v = 0
		return nil
	}
	n, e := strconv.ParseInt(s, 10, 64)
	if e != nil || n < 0 {
		return fmt.Errorf("invalid nonnegative integer %q", s)
	}
	*v = integer(n)
	return nil
}

type boolean bool

func (v *boolean) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s != "" && s != "0" && s != "1" {
		return fmt.Errorf("invalid UCI boolean %q", s)
	}
	*v = s == "1"
	return nil
}

type duration time.Duration

func (v *duration) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s == "" {
		*v = 0
		return nil
	}
	d, e := time.ParseDuration(s)
	if e != nil || d < 0 {
		return fmt.Errorf("invalid duration %q", s)
	}
	*v = duration(d)
	return nil
}

type number float64

func (v *number) UnmarshalJSON(b []byte) error {
	var s string
	if e := json.Unmarshal(b, &s); e != nil {
		return e
	}
	if s == "" {
		*v = 0
		return nil
	}
	n, e := strconv.ParseFloat(s, 64)
	if e != nil || n < 0 || math.IsNaN(n) || math.IsInf(n, 0) {
		return fmt.Errorf("invalid number %q", s)
	}
	*v = number(n)
	return nil
}

type stringList []string

func (v *stringList) UnmarshalJSON(b []byte) error {
	var s string
	if json.Unmarshal(b, &s) == nil {
		if s != "" {
			*v = []string{s}
		}
		return nil
	}
	return json.Unmarshal(b, (*[]string)(v))
}
