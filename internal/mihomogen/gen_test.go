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

	bundle, err := GenerateServerConfig(node, inbounds, []model.User{activeUser, expiredUser}, certs, time.Now())
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
