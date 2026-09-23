package uci

import (
	"encoding/json"
	"fmt"
	"time"
)

// Keep the first conversion error, including its UCI key, while mapping fields.
// Missing keys must not overwrite protocol defaults.
type decoder struct {
	fields map[string]json.RawMessage
	err    error
}

func (d *decoder) read(key string, target any) {
	if d.err != nil {
		return
	}
	if raw, ok := d.fields[key]; ok {
		if err := json.Unmarshal(raw, target); err != nil {
			d.err = fmt.Errorf("%s: %w", key, err)
		}
	}
}
func (d *decoder) text(key string, v *string)            { d.read(key, v) }
func (d *decoder) integer(key string, v *int64)          { d.read(key, (*integer)(v)) }
func (d *decoder) boolean(key string, v *bool)           { d.read(key, (*boolean)(v)) }
func (d *decoder) duration(key string, v *time.Duration) { d.read(key, (*duration)(v)) }
func (d *decoder) number(key string, v *float64)         { d.read(key, (*number)(v)) }
func (d *decoder) list(key string, v *[]string)          { d.read(key, (*stringList)(v)) }
func (d *decoder) optionalInteger(key string, v **int64) {
	if _, ok := d.fields[key]; !ok {
		return
	}
	var value *integer
	d.read(key, &value)
	*v = (*int64)(value)
}
