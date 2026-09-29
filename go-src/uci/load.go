package uci

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os/exec"
	"sort"
	"time"
)

const maxConfigSize = 4 << 20

// Load reads a UCI package through OpenWrt's native UCI service. No LuCI session
// is used: browser-local edits must be supplied explicitly as a snapshot.
func Load(name string) ([]Section, error) {
	request, err := json.Marshal(struct {
		Config string `json:"config"`
	}{name})
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "/bin/ubus", "call", "uci", "get", string(request))
	var output limitedBuffer
	cmd.Stdout = &output
	cmd.WaitDelay = time.Second
	// Do not include raw UCI output in errors: it can contain credentials.
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			err = ctx.Err()
		}
		return nil, fmt.Errorf("read UCI package %q: %w", name, err)
	}
	sections, err := decodePackage(output.buffer.Bytes())
	if err != nil {
		return nil, fmt.Errorf("read UCI package %q: %w", name, err)
	}
	return sections, nil
}

type limitedBuffer struct{ buffer bytes.Buffer }

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if len(p) > maxConfigSize-b.buffer.Len() {
		return 0, errors.New("UCI configuration exceeds 4 MiB")
	}
	return b.buffer.Write(p)
}

// rpcd returns a map; .index preserves UCI order (and routing rule priority).
func decodePackage(data []byte) ([]Section, error) {
	if len(data) > maxConfigSize {
		return nil, errors.New("UCI configuration exceeds 4 MiB")
	}
	var response struct {
		Values map[string]Section `json:"values"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return nil, err
	}
	if response.Values == nil {
		return nil, errors.New("UCI response is missing values")
	}
	sections := make([]Section, 0, len(response.Values))
	indexes := make(map[float64]bool)
	for name, s := range response.Values {
		index, ok := s[".index"].(float64)
		if s.String(SectionName) != name || s.String(SectionType) == "" || !ok || index < 0 || index != math.Trunc(index) || indexes[index] {
			return nil, errors.New("invalid UCI section metadata")
		}
		indexes[index] = true
		sections = append(sections, s)
	}
	sort.Slice(sections, func(i, j int) bool { return sections[i][".index"].(float64) < sections[j][".index"].(float64) })
	return sections, nil
}
