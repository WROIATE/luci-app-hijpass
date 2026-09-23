package protocol

import (
	"hijpass/config/uci"
	"testing"
)

// A protocol defined and registered entirely in this file exercises extension
// without adding a case to either the factory or the decode entry point.
type registrationTestNode struct {
	BaseOptions
	Value string
}

func (n *registrationTestNode) DecodeUCI(d *uci.Decoder) error {
	n.BaseOptions.decodeUCI(d)
	d.Text("value", &n.Value)
	return d.Err()
}
func (n *registrationTestNode) Validate() error { return nil }
func init() {
	register("registration-test", func() Node { return &registrationTestNode{Value: "default"} })
}
func TestProtocolSelfRegistration(t *testing.T) {
	node, err := Decode([]byte(`{"type":"registration-test","listen_port":"10001","socks_port":"10002","value":"decoded"}`))
	if err != nil {
		t.Fatal(err)
	}
	if node.(*registrationTestNode).Value != "decoded" {
		t.Fatal("registered protocol decoder was not called")
	}
	fresh, err := New("registration-test")
	if err != nil {
		t.Fatal(err)
	}
	if fresh == node || fresh.(*registrationTestNode).Value != "default" {
		t.Fatal("factory reused mutated node instead of creating defaults")
	}
}
func TestDuplicateRegistrationRejected(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("duplicate registration accepted")
		}
	}()
	register("registration-test", func() Node { return &registrationTestNode{} })
}
