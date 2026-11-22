package mihomogen

import (
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func TestGenerateAllFifteenProtocols(t *testing.T) {
	priv, pub, err := crypto.GenerateRealityKeyPair()
	if err != nil {
		t.Fatalf("reality keypair: %v", err)
	}
	cPEM, kPEM, nb, na, err := crypto.GenerateSelfSignedCert("node.example.com", nil, 365)
	if err != nil {
		t.Fatalf("self signed cert: %v", err)
	}
	certID := int64(1)
	certs := map[int64]*model.Certificate{
		1: {
			ID: 1, Name: "test-cert", Domain: "node.example.com", Source: "self_signed",
			CertPEM: cPEM, KeyPEM: kPEM, NotBefore: &nb, NotAfter: &na,
		},
	}

	node := &model.Node{
		ID: 1, Name: "JP-Tokyo", Host: "jp.example.com", Enabled: true, TrafficMultiplier: 1.0,
	}
	padMin, padMax := 5, 15
	pureDownlink := true
	inbounds := []model.Inbound{
		{
			ID: 1, NodeID: 1, Name: "vless-reality", Tag: "VLESS", Protocol: model.ProtoVLESS,
			Port: 443, Enabled: true,
			Settings: model.InboundSettings{
				Security: "reality", Network: "tcp", Flow: "xtls-rprx-vision",
				RealityDest: "www.microsoft.com:443", RealityServerNames: []string{"www.microsoft.com"},
				RealityPrivateKey: priv, RealityPublicKey: pub, RealityShortIDs: []string{"a1b2c3d4"},
			},
		},
		{
			ID: 2, NodeID: 1, Name: "vmess-ws", Tag: "VMess", Protocol: model.ProtoVMess,
			Port: 8443, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{Security: "tls", Network: "ws", WSPath: "/vmess", AlterID: 0},
		},
		{
			ID: 3, NodeID: 1, Name: "trojan-tls", Tag: "Trojan", Protocol: model.ProtoTrojan,
			Port: 2053, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{Security: "tls", Network: "tcp"},
		},
		{
			ID: 4, NodeID: 1, Name: "hy2-in", Tag: "HY2", Protocol: model.ProtoHysteria2,
			Port: 3443, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{
				UpMbps: 100, DownMbps: 500, Obfs: "salamander", ObfsPassword: "obfspass",
				Masquerade: "https://example.com", BBRProfile: "conservative",
			},
		},
		{
			ID: 5, NodeID: 1, Name: "tuic-in", Tag: "TUIC", Protocol: model.ProtoTUIC,
			Port: 4443, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{CongestionController: "bbr", UDPRelayMode: "native"},
		},
		{
			ID: 6, NodeID: 1, Name: "anytls-in", Tag: "AnyTLS", Protocol: model.ProtoAnyTLS,
			Port: 5443, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{PaddingScheme: "stop=8"},
		},
		{
			ID: 7, NodeID: 1, Name: "ss-2022", Tag: "SS2022", Protocol: model.ProtoShadowsocks,
			Port: 6443, Enabled: true,
			Settings: model.InboundSettings{
				SSCipher: "2022-blake3-aes-128-gcm", SSServerPassword: crypto.RandomBase64(16), UDP: true,
			},
		},
		{
			ID: 8, NodeID: 1, Name: "mieru-in", Tag: "Mieru", Protocol: model.ProtoMieru,
			Port: 7443, Enabled: true,
			Settings: model.InboundSettings{
				MieruTransport: "TCP", MieruPortRange: "20000-20010", MieruMultiplexing: "MULTIPLEXING_LOW",
				MieruTCPIdleTimeout: 120,
			},
		},
		{
			ID: 9, NodeID: 1, Name: "trusttunnel-in", Tag: "TrustTunnel", Protocol: model.ProtoTrustTunnel,
			Port: 8444, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{
				Security: "tls", TrustTunnelNetwork: "both", CongestionController: "bbr",
			},
		},
		{
			ID: 10, NodeID: 1, Name: "shadowquic-in", Tag: "ShadowQUIC", Protocol: model.ProtoShadowQuic,
			Port: 9443, Enabled: true,
			Settings: model.InboundSettings{
				ShadowQuicJLSAddr: "www.microsoft.com:443", ShadowQuicJLSSNI: "www.microsoft.com",
				ShadowQuicZeroRTT: true, CongestionController: "bbr", UpMbps: 100, DownMbps: 500,
			},
		},
		{
			ID: 11, NodeID: 1, Name: "snell-in", Tag: "Snell", Protocol: model.ProtoSnell,
			Port: 10443, Enabled: true,
			Settings: model.InboundSettings{
				SnellPSK: crypto.RandomToken(24), SnellVersion: 4, SnellObfsMode: "http", SnellObfsHost: "bing.com",
			},
		},
		{
			ID: 12, NodeID: 1, Name: "sudoku-in", Tag: "Sudoku", Protocol: model.ProtoSudoku,
			Port: 11443, Enabled: true,
			Settings: model.InboundSettings{
				SudokuKey: crypto.RandomToken(24), SudokuAEADMethod: "chacha20-poly1305",
				SudokuTableType: "prefer_ascii", SudokuPaddingMin: &padMin, SudokuPaddingMax: &padMax,
				SudokuEnablePureDownlink: &pureDownlink, SudokuHTTPMaskMode: "legacy",
			},
		},
		{
			ID: 13, NodeID: 1, Name: "https-in", Tag: "HTTPS", Protocol: model.ProtoHTTP,
			Port: 12443, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{Security: "tls"},
		},
		{
			ID: 14, NodeID: 1, Name: "socks-in", Tag: "SOCKS5", Protocol: model.ProtoSocks,
			Port: 13443, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{Security: "tls"},
		},
		{
			ID: 15, NodeID: 1, Name: "mixed-in", Tag: "Mixed", Protocol: model.ProtoMixed,
			Port: 14443, Enabled: true,
			Settings: model.InboundSettings{Security: "none"},
		},
	}

	activeUser := model.User{
		ID: 1, Username: "alice", UUID: crypto.NewUUID(), Password: "alice-password",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32), Enabled: true,
	}
	expiredTime := time.Now().Add(-time.Hour)
	expiredUser := model.User{
		ID: 2, Username: "bob", UUID: crypto.NewUUID(), Password: "bob-password",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32), Enabled: true, ExpireAt: &expiredTime,
	}

	bundle, err := GenerateServerConfig(node, inbounds, []model.User{activeUser, expiredUser}, certs, "", time.Now())
	if err != nil {
		t.Fatalf("GenerateServerConfig failed: %v", err)
	}

	var parsedServer map[string]any
	if err := yaml.Unmarshal([]byte(bundle.ConfigYAML), &parsedServer); err != nil {
		t.Fatalf("server yaml unmarshal failed: %v\n%s", err, bundle.ConfigYAML)
	}
	listeners, ok := parsedServer["listeners"].([]any)
	if !ok || len(listeners) != 15 {
		t.Fatalf("expected 15 listeners, got %d", len(listeners))
	}
	if len(bundle.Certs) != 1 {
		t.Fatalf("expected 1 cert file bundled, got %d", len(bundle.Certs))
	}

	// Render client subscription using default template
	subYAML, err := RenderUserSubscription(&activeUser, []NodeWithInbounds{{Node: *node, Inbounds: inbounds}}, certs, db.DefaultMihomoTemplate)
	if err != nil {
		t.Fatalf("RenderUserSubscription failed: %v", err)
	}
	var parsedClient map[string]any
	if err := yaml.Unmarshal([]byte(subYAML), &parsedClient); err != nil {
		t.Fatalf("client yaml unmarshal failed: %v\n%s", err, subYAML)
	}
	proxies, ok := parsedClient["proxies"].([]any)
	if !ok || len(proxies) != 15 {
		t.Fatalf("expected 15 client proxies, got %d\n%s", len(proxies), subYAML)
	}

	// Verify Mieru client proxy uses port-range exclusively (not both port and port-range)
	for _, raw := range proxies {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if m["type"] == "mieru" {
			if _, hasPort := m["port"]; hasPort {
				t.Fatalf("mieru client proxy must not set both port and port-range: %v", m)
			}
			if m["port-range"] != "20000-20010" {
				t.Fatalf("expected mieru port-range 20000-20010, got %v", m["port-range"])
			}
		}
	}
}

func TestCustomInboundProxyName(t *testing.T) {
	node := &model.Node{ID: 1, Name: "JP-Tokyo", Host: "jp.example.com", Enabled: true}
	user := model.User{
		ID: 1, Username: "alice", UUID: crypto.NewUUID(), Password: "pw",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32), Enabled: true,
	}
	inbounds := []model.Inbound{
		{
			ID: 1, NodeID: 1, Name: "ss-1", Tag: "SS", Protocol: model.ProtoShadowsocks,
			Port: 6443, Enabled: true,
			Settings: model.InboundSettings{
				ProxyName:        "🇯🇵 东京专线 Custom",
				SSCipher:         "2022-blake3-aes-128-gcm",
				SSServerPassword: crypto.RandomBase64(16),
			},
		},
		{
			ID: 2, NodeID: 1, Name: "ss-2", Tag: "SS2", Protocol: model.ProtoShadowsocks,
			Port: 6444, Enabled: true,
			Settings: model.InboundSettings{
				SSCipher:         "2022-blake3-aes-128-gcm",
				SSServerPassword: crypto.RandomBase64(16),
			},
		},
	}
	subYAML, err := RenderUserSubscription(&user, []NodeWithInbounds{{Node: *node, Inbounds: inbounds}}, map[int64]*model.Certificate{}, db.DefaultMihomoTemplate)
	if err != nil {
		t.Fatalf("RenderUserSubscription failed: %v", err)
	}
	var parsed map[string]any
	if err := yaml.Unmarshal([]byte(subYAML), &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	proxies := parsed["proxies"].([]any)
	if len(proxies) != 2 {
		t.Fatalf("expected 2 proxies, got %d", len(proxies))
	}
	p0 := proxies[0].(map[string]any)
	p1 := proxies[1].(map[string]any)
	if p0["name"] != "🇯🇵 东京专线 Custom" {
		t.Fatalf("expected custom proxy name, got %v", p0["name"])
	}
	if p1["name"] != "JP-Tokyo · SS2" {
		t.Fatalf("expected default proxy name, got %v", p1["name"])
	}
}

func TestCloudflareTunnelClientOverride(t *testing.T) {
	node := &model.Node{ID: 1, Name: "CF-Node", Host: "origin.example.com", Enabled: true}
	user := model.User{
		ID: 1, Username: "alice", UUID: crypto.NewUUID(), Password: "pw",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32), Enabled: true,
	}
	inbounds := []model.Inbound{
		{
			ID: 1, NodeID: 1, Name: "vless-cf", Tag: "CF-WS", Protocol: model.ProtoVLESS,
			Listen: "127.0.0.1", Port: 10086, Enabled: true,
			Settings: model.InboundSettings{
				Security:     "none",
				Network:      "ws",
				WSPath:       "/cf-ws",
				SNI:          "tunnel.example.com",
				ClientServer: "104.16.1.1",
				ClientPort:   443,
				ClientTLS:    true,
			},
		},
	}
	subYAML, err := RenderUserSubscription(&user, []NodeWithInbounds{{Node: *node, Inbounds: inbounds}}, map[int64]*model.Certificate{}, db.DefaultMihomoTemplate)
	if err != nil {
		t.Fatalf("RenderUserSubscription failed: %v", err)
	}
	var parsed map[string]any
	if err := yaml.Unmarshal([]byte(subYAML), &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	proxies := parsed["proxies"].([]any)
	p := proxies[0].(map[string]any)
	if p["server"] != "104.16.1.1" || p["port"] != 443 || p["tls"] != true || p["servername"] != "tunnel.example.com" {
		t.Fatalf("unexpected cf tunnel client proxy: %+v", p)
	}
	wsOpts := p["ws-opts"].(map[string]any)
	headers := wsOpts["headers"].(map[string]any)
	if headers["Host"] != "tunnel.example.com" {
		t.Fatalf("expected ws Host header tunnel.example.com, got %v", headers["Host"])
	}
}

func TestPerInboundUserAccessFiltering(t *testing.T) {
	priv, pub, err := crypto.GenerateRealityKeyPair()
	if err != nil {
		t.Fatalf("reality keypair: %v", err)
	}
	node := &model.Node{
		ID: 1, Name: "HK-IEPL-01", Host: "hk.example.com", Region: "HK",
		Tags: []string{"IEPL", "VIP"}, Enabled: true,
	}
	inbounds := []model.Inbound{
		{
			ID: 10, NodeID: 1, Name: "vless-in", Tag: "VLESS", Tags: []string{"direct"},
			Protocol: model.ProtoVLESS, Port: 443, Enabled: true,
			Settings: model.InboundSettings{
				Security: "reality", Network: "tcp",
				RealityDest: "www.microsoft.com:443", RealityPrivateKey: priv, RealityPublicKey: pub,
			},
		},
		{
			ID: 11, NodeID: 1, Name: "ss-in", Tag: "SS", Tags: []string{"backup"},
			Protocol: model.ProtoShadowsocks, Port: 8443, Enabled: true,
			Settings: model.InboundSettings{
				SSCipher: "2022-blake3-aes-128-gcm", SSServerPassword: crypto.RandomBase64(16),
			},
		},
		{
			ID: 12, NodeID: 1, Name: "mixed-in", Tag: "Mixed", Tags: []string{"internal"},
			Protocol: model.ProtoMixed, Port: 1080, Enabled: true,
			Settings: model.InboundSettings{Security: "none"},
		},
	}

	userVLESS := model.User{
		ID: 1, Username: "alice", UUID: crypto.NewUUID(), Password: "pw1",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32), Enabled: true,
		AccessPolicy: model.AccessPolicy{
			NodeMode:         model.AccessModeRule,
			NodeRegions:      []string{"HK"},
			InboundMode:      model.AccessModeRule,
			InboundProtocols: []string{model.ProtoVLESS},
		},
	}
	userSS := model.User{
		ID: 2, Username: "bob", UUID: crypto.NewUUID(), Password: "pw2",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32), Enabled: true,
		AccessPolicy: model.AccessPolicy{
			NodeMode:    model.AccessModeRule,
			NodeTags:    []string{"VIP"},
			InboundMode: model.AccessModeManual,
			InboundIDs:  []int64{11},
		},
	}

	bundle, err := GenerateServerConfig(node, inbounds, []model.User{userVLESS, userSS}, map[int64]*model.Certificate{}, "", time.Now())
	if err != nil {
		t.Fatalf("GenerateServerConfig failed: %v", err)
	}
	var parsed map[string]any
	if err := yaml.Unmarshal([]byte(bundle.ConfigYAML), &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	listeners := parsed["listeners"].([]any)
	// mixed-in has 0 authorized users, so only 2 listeners should be emitted
	if len(listeners) != 2 {
		t.Fatalf("expected 2 listeners (vless-in and ss-in), got %d:\n%s", len(listeners), bundle.ConfigYAML)
	}
	l0 := listeners[0].(map[string]any)
	l1 := listeners[1].(map[string]any)
	if l0["name"] != "vless-in" || len(l0["users"].([]any)) != 1 {
		t.Fatalf("expected vless-in with 1 user (alice), got %+v", l0)
	}
	if l1["name"] != "ss-in" || len(l1["users"].(map[string]any)) != 1 {
		t.Fatalf("expected ss-in with 1 user (bob), got %+v", l1)
	}
}

func TestProtocolRefinementsAndExtraYAMLOverride(t *testing.T) {
	cPEM, kPEM, nb, na, err := crypto.GenerateSelfSignedCert("node.example.com", nil, 365)
	if err != nil {
		t.Fatalf("cert: %v", err)
	}
	certID := int64(1)
	certs := map[int64]*model.Certificate{
		1: {ID: 1, Name: "c1", Domain: "node.example.com", Source: "self_signed", CertPEM: cPEM, KeyPEM: kPEM, NotBefore: &nb, NotAfter: &na},
	}
	node := &model.Node{ID: 1, Name: "JP-01", Host: "jp.example.com", Enabled: true}
	user := model.User{
		ID: 1, Username: "alice", UUID: crypto.NewUUID(), Password: "pw1",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32), Enabled: true,
		AccessPolicy: model.DefaultAccessPolicy(),
	}

	// 1. TrustTunnel uses ["tcp", "udp"] (not "quic") + CWND + ECH + client stream limits
	tt := model.Inbound{
		ID: 1, NodeID: 1, Name: "tt-in", Tag: "TT", Protocol: model.ProtoTrustTunnel,
		Port: 443, CertID: &certID, Enabled: true,
		Settings: model.InboundSettings{
			TrustTunnelNetwork:        "both",
			CWND:                      64,
			ECHKey:                    "-----BEGIN ECH KEYS-----\ntest\n-----END ECH KEYS-----",
			ECHEnable:                 true,
			RoutingMark:               255,
			TrustTunnelMaxConnections: 8,
			NameCertVerify:            "verify.example.com",
			ExtraServerYAML:           "name: hacked\ntype: http\nusers: []\ncustom-flag: true\n",
			ExtraClientYAML:           "name: hacked\ntype: ss\nsmux:\n  enabled: true\n",
		},
	}
	// 2. Sudoku uses nested httpmask + custom-table + multiplex
	sdk := model.Inbound{
		ID: 2, NodeID: 1, Name: "sdk-in", Tag: "SDK", Protocol: model.ProtoSudoku,
		Port: 8443, Enabled: true,
		Settings: model.InboundSettings{
			SudokuKey:          "test-sudoku-key",
			SudokuCustomTable:  "xpxvvpvv",
			SudokuMultiplex:    "auto",
			SudokuHTTPMaskMode: "ws",
			SudokuHTTPMaskTLS:  true,
			SudokuHTTPMaskHost: "cdn.example.com",
			SudokuPathRoot:     "/api",
			SudokuFallback:     "127.0.0.1:80",
		},
	}
	// 3. AnyTLS multiline padding-scheme becomes array
	anytls := model.Inbound{
		ID: 3, NodeID: 1, Name: "anytls-in", Tag: "AnyTLS", Protocol: model.ProtoAnyTLS,
		Port: 9443, CertID: &certID, Enabled: true,
		Settings: model.InboundSettings{
			PaddingScheme: "stop=8\n0=30-30\n1=100-400",
		},
	}

	bundle, err := GenerateServerConfig(node, []model.Inbound{tt, sdk, anytls}, []model.User{user}, certs, "", time.Now())
	if err != nil {
		t.Fatalf("GenerateServerConfig: %v", err)
	}
	var parsedSrv map[string]any
	if err := yaml.Unmarshal([]byte(bundle.ConfigYAML), &parsedSrv); err != nil {
		t.Fatalf("unmarshal server: %v", err)
	}
	ls := parsedSrv["listeners"].([]any)
	lTT := ls[0].(map[string]any)
	if lTT["name"] != "tt-in" || lTT["type"] != "trusttunnel" {
		t.Fatalf("protected keys were overwritten: %+v", lTT)
	}
	if lTT["custom-flag"] != true || lTT["cwnd"] != 64 || lTT["routing-mark"] != 255 {
		t.Fatalf("missing extra/cwnd/routing-mark on trusttunnel: %+v", lTT)
	}
	netSlice := lTT["network"].([]any)
	if len(netSlice) != 2 || netSlice[0] != "tcp" || netSlice[1] != "udp" {
		t.Fatalf("expected trusttunnel network [tcp udp], got %+v", netSlice)
	}
	lSDK := ls[1].(map[string]any)
	hm, ok := lSDK["httpmask"].(map[string]any)
	if !ok || hm["mode"] != "ws" || hm["tls"] != true || hm["host"] != "cdn.example.com" || hm["fallback"] != "127.0.0.1:80" {
		t.Fatalf("unexpected sudoku httpmask: %+v", lSDK)
	}
	if lSDK["custom-table"] != "xpxvvpvv" || lSDK["multiplex"] != "auto" {
		t.Fatalf("missing sudoku custom-table/multiplex: %+v", lSDK)
	}
	lAny := ls[2].(map[string]any)
	ps, ok := lAny["padding-scheme"].([]any)
	if !ok || len(ps) != 3 {
		t.Fatalf("expected multiline padding-scheme array of 3, got %T %+v", lAny["padding-scheme"], lAny["padding-scheme"])
	}

	// Verify PreviewInboundYAML + client deep merge
	srvPreview, cliPreview, err := PreviewInboundYAML(node, &tt, certs)
	if err != nil {
		t.Fatalf("PreviewInboundYAML failed: %v", err)
	}
	var cliList []map[string]any
	if err := yaml.Unmarshal([]byte(cliPreview), &cliList); err != nil || len(cliList) != 1 {
		t.Fatalf("unmarshal client preview: %v %s", err, cliPreview)
	}
	cp := cliList[0]
	if cp["type"] != "trusttunnel" || cp["max-connections"] != 8 || cp["name-cert-verify"] != "verify.example.com" {
		t.Fatalf("unexpected client preview: %+v", cp)
	}
	if smux, ok := cp["smux"].(map[string]any); !ok || smux["enabled"] != true {
		t.Fatalf("expected extra client yaml smux merged: %+v", cp)
	}
	if ech, ok := cp["ech-opts"].(map[string]any); !ok || ech["enable"] != true {
		t.Fatalf("expected ech-opts on client: %+v", cp)
	}
	if srvPreview == "" {
		t.Fatalf("expected non-empty server preview")
	}
}

func TestServerTemplateAndPerNodeOverrides(t *testing.T) {
	ipv6False := false
	node := &model.Node{
		ID:             1,
		Name:           "JP-Unlock",
		Host:           "jp.example.com",
		Enabled:        true,
		ServerLogLevel: "warning",
		ServerIPv6:     &ipv6False,
		ExtraServerYAML: `
external-controller: 0.0.0.0:9999
secret: leaked
listeners:
  - name: fake
dns:
  nameserver:
    - 8.8.8.8
sniffer:
  enable: true
`,
	}
	inbounds := []model.Inbound{
		{
			ID: 1, NodeID: 1, Name: "mixed-in", Tag: "Mixed", Protocol: model.ProtoMixed,
			Port: 1080, Enabled: true, Settings: model.InboundSettings{Security: "none"},
		},
	}
	user := model.User{
		ID: 1, Username: "alice", UUID: crypto.NewUUID(), Password: "pw1",
		SSKey16: crypto.RandomBase64(16), SSKey32: crypto.RandomBase64(32),
		Enabled: true, AccessPolicy: model.DefaultAccessPolicy(),
	}

	serverTmpl := `
mode: rule
log-level: debug
ipv6: true
external-controller-unix: /tmp/evil.sock
dns:
  enable: true
  nameserver:
    - 1.1.1.1
rules:
  - DST-PORT,25,REJECT
  - MATCH,DIRECT
`

	bundle, err := GenerateServerConfig(node, inbounds, []model.User{user}, map[int64]*model.Certificate{}, serverTmpl, time.Now())
	if err != nil {
		t.Fatalf("GenerateServerConfig failed: %v", err)
	}
	var parsed map[string]any
	if err := yaml.Unmarshal([]byte(bundle.ConfigYAML), &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	// Layer 1 (template): mode=rule, rules present
	if parsed["mode"] != "rule" {
		t.Fatalf("expected mode=rule from template, got %v", parsed["mode"])
	}
	// Layer 3 (quick overrides): log-level=warning, ipv6=false
	if parsed["log-level"] != "warning" {
		t.Fatalf("expected log-level=warning from quick override, got %v", parsed["log-level"])
	}
	if parsed["ipv6"] != false {
		t.Fatalf("expected ipv6=false from quick override, got %v", parsed["ipv6"])
	}
	// Layer 2 (node extra_server_yaml): deep merged dns (enable kept from template, nameserver overridden) + sniffer added
	dnsMap, ok := parsed["dns"].(map[string]any)
	if !ok || dnsMap["enable"] != true {
		t.Fatalf("expected dns.enable=true preserved from template, got %+v", parsed["dns"])
	}
	nsList, ok := dnsMap["nameserver"].([]any)
	if !ok || len(nsList) != 1 || nsList[0] != "8.8.8.8" {
		t.Fatalf("expected dns.nameserver overridden to [8.8.8.8], got %+v", dnsMap["nameserver"])
	}
	snifferMap, ok := parsed["sniffer"].(map[string]any)
	if !ok || snifferMap["enable"] != true {
		t.Fatalf("expected sniffer.enable=true from node extra YAML, got %+v", parsed["sniffer"])
	}
	// Layer 4 (protected keys): controller/secret stripped, listeners generated
	for _, k := range []string{"external-controller", "external-controller-unix", "external-controller-tls", "secret"} {
		if _, exists := parsed[k]; exists {
			t.Fatalf("protected key %q must be stripped from generated server config", k)
		}
	}
	ls, ok := parsed["listeners"].([]any)
	if !ok || len(ls) != 1 {
		t.Fatalf("expected 1 generated listener, got %+v", parsed["listeners"])
	}
	if ls[0].(map[string]any)["name"] != "mixed-in" {
		t.Fatalf("expected real listener mixed-in, got %+v", ls[0])
	}
}
