package uci

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"reflect"
	"testing"
)

func TestDecodePackagePreservesSections(t *testing.T) {
	// rpcd's object keys can be delivered in any order. Rules must follow .index.
	data := []byte(`{"values":{
  "a":{".name":"a",".type":"shunt_rule",".index":2,"value":["one","two"]},
  "cfg123":{".name":"cfg123",".anonymous":true,".type":"hijpass",".index":0,"enabled":"1"},
  "z":{".name":"z",".type":"shunt_rule",".index":1,"value":"quote'\\\"\nline"}
 }}`)
	sections, err := decodePackage(data)
	if err != nil {
		t.Fatal(err)
	}
	if got := []string{sections[0].String(".name"), sections[1].String(".name"), sections[2].String(".name")}; !reflect.DeepEqual(got, []string{"cfg123", "z", "a"}) {
		t.Fatal(got)
	}
	if !reflect.DeepEqual(sections[2].List("value"), []string{"one", "two"}) {
		t.Fatal(sections[2])
	}
	if sections[0][".anonymous"] != true || sections[1].String("value") != "quote'\\\"\nline" {
		t.Fatal(sections)
	}
}

func TestDecodePackageRejectsInvalidResponses(t *testing.T) {
	for _, data := range []string{
		`null`, `{}`, `{"values":null}`, `{"values":[]}`, `{"values":{"x":null}}`,
		`{"values":{"x":{".name":"x",".type":"rule"}}}`,
		`{"values":{"x":{".name":"wrong",".type":"rule",".index":0}}}`,
		`{"values":{"x":{".name":"x",".type":"rule",".index":-1}}}`,
		`{"values":{"x":{".name":"x",".type":"rule",".index":0.5}}}`,
		`{"values":{"x":{".name":"x",".type":"rule",".index":0},"y":{".name":"y",".type":"rule",".index":0}}}`,
	} {
		t.Run(data, func(t *testing.T) {
			if _, err := decodePackage([]byte(data)); err == nil {
				t.Fatal("accepted invalid response")
			}
		})
	}
	if _, err := decodePackage(bytes.Repeat([]byte(" "), maxConfigSize+1)); err == nil {
		t.Fatal("accepted oversized response")
	}
	var buffer limitedBuffer
	if _, err := buffer.Write(bytes.Repeat([]byte(" "), maxConfigSize)); err != nil {
		t.Fatal(err)
	}
	if _, err := buffer.Write([]byte("x")); err == nil {
		t.Fatal("unbounded command output")
	}
}

func TestDecodePackageMatchesEverySnapshot(t *testing.T) {
	data, err := os.ReadFile("../testdata/compatibility.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name     string
		Sections []Section
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			values := map[string]Section{}
			for index, s := range fixture.Sections {
				s[".index"] = float64(index)
				values[s.String(".name")] = s
			}
			data, err := json.Marshal(map[string]any{"values": values})
			if err != nil {
				t.Fatal(err)
			}
			got, err := decodePackage(data)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, fixture.Sections) {
				t.Fatal("sections changed")
			}
		})
	}
}

func TestCommandPipeCannotBypassOutputLimit(t *testing.T) {
	// os/exec copies stdout through io.Copy. An embedded bytes.Buffer would expose
	// ReaderFrom and bypass a size limit implemented only by Write.
	reader := io.LimitReader(bytes.NewReader(bytes.Repeat([]byte("x"), maxConfigSize+1)), maxConfigSize+1)
	var buffer limitedBuffer
	if _, err := io.Copy(&buffer, reader); err == nil {
		t.Fatal("command output bypassed the limit")
	}
	if buffer.buffer.Len() > maxConfigSize {
		t.Fatal("buffer exceeded limit")
	}
}
