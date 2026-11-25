package hub

import (
	"testing"

	"github.com/mihob/mihob/internal/mihomogen"
	"github.com/mihob/mihob/internal/model"
)

func TestParseClientEndpointLines(t *testing.T) {
	raw := `
# comment line
// another comment
IP,Port,Region
104.16.1.1:443#香港移动
104.16.1.2:2053#日本联通
[2606:4700::1]:8443#IPV6-US
104.16.1.3#无端口回落
104.16.1.4
cf.090227.xyz:443
104.16.1.5,2083,SG
104.16.1.1:443#重复项应去重
<html>not-valid</html>
`
	eps := ParseClientEndpointLines(raw, 443)
	if len(eps) != 7 {
		t.Fatalf("expected 7 parsed endpoints, got %d: %+v", len(eps), eps)
	}
	if eps[0].Host != "104.16.1.1" || eps[0].Port != 443 || eps[0].Label != "香港移动" {
		t.Fatalf("unexpected eps[0]: %+v", eps[0])
	}
	if eps[2].Host != "2606:4700::1" || eps[2].Port != 8443 || eps[2].Label != "IPV6-US" {
		t.Fatalf("unexpected eps[2]: %+v", eps[2])
	}
	if eps[3].Host != "104.16.1.3" || eps[3].Port != 443 || eps[3].Label != "无端口回落" {
		t.Fatalf("unexpected eps[3]: %+v", eps[3])
	}
	if eps[6].Host != "104.16.1.5" || eps[6].Port != 2083 || eps[6].Label != "SG" {
		t.Fatalf("unexpected eps[6]: %+v", eps[6])
	}

	// Keyword include + exclude filter
	kwFiltered, err := FilterResolvedEndpoints(eps, "keyword", "香港, 日本, SG", "联通")
	if err != nil {
		t.Fatalf("keyword filter error: %v", err)
	}
	if len(kwFiltered) != 2 || kwFiltered[0].Host != "104.16.1.1" || kwFiltered[1].Host != "104.16.1.5" {
		t.Fatalf("unexpected keyword filtered endpoints: %+v", kwFiltered)
	}

	// Regex include + exclude filter
	reFiltered, err := FilterResolvedEndpoints(eps, "regex", `:(443|8443)#`, `IPV6`)
	if err != nil {
		t.Fatalf("regex filter error: %v", err)
	}
	if len(reFiltered) != 2 || reFiltered[0].Host != "104.16.1.1" || reFiltered[1].Host != "104.16.1.3" {
		t.Fatalf("unexpected regex filtered endpoints: %+v", reFiltered)
	}

	// Invalid regex returns error
	if _, err := FilterResolvedEndpoints(eps, "regex", `[unclosed`, ""); err == nil {
		t.Fatalf("expected error for invalid regex")
	}

	// Comma-separated manual optimal IPs on one line
	manual := ParseClientEndpointLines("104.16.1.1, 104.16.1.2:2053#JP, cf.example.com", 443)
	if len(manual) != 3 || manual[0].Host != "104.16.1.1" || manual[1].Port != 2053 || manual[1].Label != "JP" || manual[2].Host != "cf.example.com" {
		t.Fatalf("unexpected comma-separated manual endpoints: %+v", manual)
	}
}

func TestRenderUserSubscriptionWithResolvedEndpoints(t *testing.T) {
	node := model.Node{ID: 1, Name: "US-CF", Host: "origin.example.com", Enabled: true}
	in := model.Inbound{
		ID:       10,
		NodeID:   1,
		Name:     "vless-cf",
		Tag:      "CF",
		Protocol: model.ProtoVLESS,
		Port:     8080,
		Enabled:  true,
		Settings: model.InboundSettings{
			Security:  "none",
			ClientTLS: true,
			SNI:       "tunnel.example.com",
			Network:   "ws",
			WSPath:    "/ws",
		},
	}
	user := &model.User{
		ID:       1,
		Username: "alice",
		UUID:     "11111111-1111-1111-1111-111111111111",
		Enabled:  true,
	}
	resolved := map[int64][]model.ResolvedEndpoint{
		10: {
			{Host: "104.16.1.1", Port: 443, Label: "HK"},
			{Host: "104.16.1.2", Port: 2053, Label: "JP"},
		},
	}
	tmpl := "proxies:\n  {{PROXIES}}\nproxy-groups:\n  - name: AUTO\n    type: select\n    proxies:\n      {{PROXY_NAMES}}\n"
	out, err := mihomogen.RenderUserSubscriptionWithEndpoints(
		user,
		[]mihomogen.NodeWithInbounds{{Node: node, Inbounds: []model.Inbound{in}}},
		map[int64]*model.Certificate{},
		tmpl,
		resolved,
	)
	if err != nil {
		t.Fatalf("render error: %v", err)
	}
	for _, want := range []string{"US-CF · CF · HK", "104.16.1.1", "US-CF · CF · JP", "104.16.1.2", "port: 2053", "servername: tunnel.example.com"} {
		if !containsStr(out, want) {
			t.Fatalf("expected %q in rendered YAML:\n%s", want, out)
		}
	}
}

func containsStr(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
