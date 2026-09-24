package generator

import (
	"encoding/json"
	"testing"
)

func TestOutputNullAndOmission(t *testing.T) {
	for _, output := range []json.Marshaler{(*XrayConfig)(nil), (*SingBoxConfig)(nil)} {
		data, err := output.MarshalJSON()
		if err != nil || string(data) != "null" {
			t.Fatalf("%T: got %s, %v", output, data, err)
		}
	}
	data, err := json.Marshal(Generated{Nodes: map[string]json.Marshaler{}})
	if err != nil || string(data) != `{"nodes":{}}` {
		t.Fatalf("absent shunt must be omitted: %s, %v", data, err)
	}
}

func TestTargetOutputTypes(t *testing.T) {
	for _, core := range []string{"sing-box", "xray"} {
		sections := fixtureConfig(t, core+"-vless-defaults")
		output, err := RenderTarget(sections, "node")
		if err != nil {
			t.Fatal(err)
		}
		switch core {
		case "sing-box":
			if _, ok := output.(*SingBoxConfig); !ok {
				t.Fatalf("unexpected output %T", output)
			}
		case "xray":
			if _, ok := output.(*XrayConfig); !ok {
				t.Fatalf("unexpected output %T", output)
			}
		}
		// Invalid target returns a nil interface, not an interface holding a nil pointer.
		output, err = RenderTarget(sections, "missing")
		if err == nil || output != nil {
			t.Fatalf("expected nil result on error: %T, %v", output, err)
		}
	}
}
