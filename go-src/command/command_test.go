package command

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestSnapshotCLIAndRPCProduceSameOutput(t *testing.T) {
	data, err := os.ReadFile("../generator/testdata/compatibility.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name     string
		Sections json.RawMessage
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		if f.Name != "sing-box-chain" {
			continue
		}
		var cli, rpc bytes.Buffer
		if err := Run([]string{"render", "--stdin"}, bytes.NewReader(f.Sections), &cli); err != nil {
			t.Fatal(err)
		}
		request, _ := json.Marshal(map[string]string{"sections": string(f.Sections)})
		if err := Run([]string{"call", "render"}, bytes.NewReader(request), &rpc); err != nil {
			t.Fatal(err)
		}
		if cli.String() != rpc.String() {
			t.Fatal("CLI and RPC output differ")
		}
		var all struct{ Nodes map[string]json.RawMessage }
		if err := json.Unmarshal(cli.Bytes(), &all); err != nil {
			t.Fatal(err)
		}
		cli.Reset()
		if err := Run([]string{"render", "--stdin", "--target", "downstream"}, bytes.NewReader(f.Sections), &cli); err != nil {
			t.Fatal(err)
		}
		var got, want any
		json.Unmarshal(cli.Bytes(), &got)
		json.Unmarshal(all.Nodes["downstream"], &want)
		if !reflect.DeepEqual(got, want) {
			t.Fatal("target output differs")
		}
		return
	}
	t.Fatal("fixture missing")
}

func TestInvalidSnapshotDoesNotFallBackToSystem(t *testing.T) {
	for _, data := range []string{"", "{}", "null", "[]", "[", "[] []"} {
		t.Run(data, func(t *testing.T) {
			var output bytes.Buffer
			err := Run([]string{"render", "--stdin"}, strings.NewReader(data), &output)
			if err == nil || strings.Contains(err.Error(), "read UCI") || output.Len() != 0 {
				t.Fatalf("unexpected result: %v %s", err, &output)
			}
			request, _ := json.Marshal(map[string]string{"sections": data})
			result := rpc("render", bytes.NewReader(request))
			response, ok := result.(rpcResponse)
			if !ok || response.Error == "" || strings.Contains(response.Error, "read UCI") {
				t.Fatalf("unexpected response: %#v", result)
			}
		})
	}
}

func TestRenderRejectsUnknownArguments(t *testing.T) {
	for _, args := range [][]string{{"render", "--bogus"}, {"render", "extra"}, {"render", "--target"}} {
		var output bytes.Buffer
		if err := Run(args, strings.NewReader(""), &output); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
}
