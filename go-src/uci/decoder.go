// Package uci provides generic readers for flat UCI JSON options.
package uci

import (
	"encoding/json"
	"fmt"
	"time"
)

// Keep the first conversion error, including its UCI key, while mapping fields.
// Missing keys must not overwrite protocol defaults.
type Decoder struct {
	fields map[string]json.RawMessage
	err    error
}

func (d *Decoder) read(key string, target any) {
	if d.err != nil {
		return
	}
	if raw, ok := d.fields[key]; ok {
		if err := json.Unmarshal(raw, target); err != nil {
			d.err = fmt.Errorf("%s: %w", key, err)
		}
	}
}
func (d *Decoder) Text(key string, v *string)            { d.read(key, v) }
func (d *Decoder) Integer(key string, v *int64)          { d.read(key, (*integer)(v)) }
func (d *Decoder) Port(key string, v *uint16)            { d.read(key, (*port)(v)) }
func (d *Decoder) Boolean(key string, v *bool)           { d.read(key, (*boolean)(v)) }
func (d *Decoder) Duration(key string, v *time.Duration) { d.read(key, (*duration)(v)) }
func (d *Decoder) Number(key string, v *float64)         { d.read(key, (*number)(v)) }
func (d *Decoder) List(key string, v *[]string)          { d.read(key, (*stringList)(v)) }
func (d *Decoder) OptionalInteger(key string, v **int64) {
	if _, ok := d.fields[key]; !ok {
		return
	}
	var value *integer
	d.read(key, &value)
	*v = (*int64)(value)
}

// NewDecoder parses a UCI section. Missing options leave destination defaults intact.
func NewDecoder(data []byte) (*Decoder, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, err
	}
	return &Decoder{fields: fields}, nil
}

// Err returns the first conversion error, annotated with its UCI option name.
func (d *Decoder) Err() error { return d.err }
