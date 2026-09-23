package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"
)

// UCI's numeric/boolean options are strings on the wire. Decode them once at the
// boundary so builders operate on typed fields and cannot silently truncate ports.
type uciInt int64

func (v *uciInt) UnmarshalJSON(b []byte) error {
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
	*v = uciInt(n)
	return nil
}

type uciBool bool

func (v *uciBool) UnmarshalJSON(b []byte) error {
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

type uciDuration time.Duration

func (v *uciDuration) UnmarshalJSON(b []byte) error {
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
	*v = uciDuration(d)
	return nil
}

type uciFloat float64

func (v *uciFloat) UnmarshalJSON(b []byte) error {
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
	*v = uciFloat(n)
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
