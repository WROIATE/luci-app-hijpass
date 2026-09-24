package source

import (
	"encoding/json"
	"errors"
	"io"
)

const maxInput = 4 << 20

func DecodeJSON(r io.Reader, v any) error {
	b, e := io.ReadAll(io.LimitReader(r, maxInput+1))
	if e != nil {
		return e
	}
	if len(b) > maxInput {
		return errors.New("configuration exceeds 4 MiB")
	}
	return json.Unmarshal(b, v)
}
