package protocol

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"
)

// UCI's numeric/boolean options are strings on the wire. Decode them once at the
// boundary so builders operate on typed fields and cannot silently truncate ports.
type Int int64

func (v *Int) UnmarshalJSON(b []byte) error {
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
	*v = Int(n)
	return nil
}

type Bool bool

func (v *Bool) UnmarshalJSON(b []byte) error {
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

type Duration time.Duration

func (v *Duration) UnmarshalJSON(b []byte) error {
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
	*v = Duration(d)
	return nil
}

type Float float64

func (v *Float) UnmarshalJSON(b []byte) error {
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
	*v = Float(n)
	return nil
}

type StringList []string

func (v *StringList) UnmarshalJSON(b []byte) error {
	var s string
	if json.Unmarshal(b, &s) == nil {
		if s != "" {
			*v = []string{s}
		}
		return nil
	}
	return json.Unmarshal(b, (*[]string)(v))
}
