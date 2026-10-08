package generator

import "testing"

func TestOutputNullSerialization(t *testing.T) {
	for _, output := range []CoreConfig{(*XrayConfig)(nil), (*SingBoxConfig)(nil)} {
		data, err := output.Serialize()
		if err != nil || string(data) != "null" {
			t.Fatalf("%T: got %s, %v", output, data, err)
		}
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
