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
	if len(fixtures) == 0 {
		t.Fatal("compatibility fixtures missing")
	}
	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			var cli, rpc bytes.Buffer
			cliErr := Run([]string{"render", "--stdin"}, bytes.NewReader(f.Sections), &cli)
			request, err := json.Marshal(map[string]string{"sections": string(f.Sections)})
			if err != nil {
				t.Fatal(err)
			}
			if err := Run([]string{"call", "render"}, bytes.NewReader(request), &rpc); err != nil {
				t.Fatal(err)
			}
			if f.Name == "xray-shadowsocks-options" {
				if cliErr == nil || !strings.Contains(cliErr.Error(), "no longer supports Shadowsocks udp_over_tcp") || cli.Len() != 0 {
					t.Fatalf("expected removed-UoT error without partial output, got %v, %s", cliErr, &cli)
				}
				var response map[string]any
				if err := json.Unmarshal(rpc.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				if len(response) != 1 || response["error"] != cliErr.Error() {
					t.Fatalf("RPC must return the same error without partial output: %s", &rpc)
				}
				return
			}
			if cliErr != nil {
				t.Fatal(cliErr)
			}
			if cli.String() != rpc.String() {
				t.Fatal("CLI and RPC output differ")
			}
			var all struct {
				Nodes map[string]json.RawMessage
				Shunt json.RawMessage
			}
			if err := json.Unmarshal(cli.Bytes(), &all); err != nil {
				t.Fatal(err)
			}
			if all.Nodes == nil {
				t.Fatal("nodes must be a JSON object")
			}
			if len(all.Shunt) > 0 {
				all.Nodes["shunt"] = all.Shunt
			}
			for target, expected := range all.Nodes {
				t.Run(target, func(t *testing.T) {
					cli.Reset()
					if err := Run([]string{"render", "--stdin", "--target", target}, bytes.NewReader(f.Sections), &cli); err != nil {
						t.Fatal(err)
					}
					var got, want map[string]any
					if err := json.Unmarshal(cli.Bytes(), &got); err != nil {
						t.Fatal(err)
					}
					if err := json.Unmarshal(expected, &want); err != nil {
						t.Fatal(err)
					}
					if got == nil || !reflect.DeepEqual(got, want) {
						t.Fatal("target must be a JSON object matching the full output")
					}
					request, err := json.Marshal(map[string]string{"sections": string(f.Sections), "target": target})
					if err != nil {
						t.Fatal(err)
					}
					rpc.Reset()
					if err := Run([]string{"call", "render"}, bytes.NewReader(request), &rpc); err != nil {
						t.Fatal(err)
					}
					var response struct {
						Config map[string]any
						Error  string
					}
					if err := json.Unmarshal(rpc.Bytes(), &response); err != nil {
						t.Fatal(err)
					}
					if response.Error != "" || !reflect.DeepEqual(response.Config, want) {
						t.Fatalf("RPC target output differs: %s", &rpc)
					}
				})
			}
		})
	}
}

func TestEmptyOutputOmitsShunt(t *testing.T) {
	sections := `[{".name":"hijpass",".type":"hijpass","enabled":"0"}]`
	request, err := json.Marshal(map[string]string{"sections": sections})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, input string
		args        []string
	}{
		{name: "CLI", input: sections, args: []string{"render", "--stdin"}},
		{name: "RPC", input: string(request), args: []string{"call", "render"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			if err := Run(tc.args, strings.NewReader(tc.input), &output); err != nil {
				t.Fatal(err)
			}
			if strings.TrimSpace(output.String()) != `{"nodes":{}}` {
				t.Fatalf("absent shunt must be omitted: %s", &output)
			}
		})
	}
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
