package mihomogen

import (
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func TestGenerateAllSevenProtocols(t *testing.T) {
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
			Settings: model.InboundSettings{UpMbps: 100, DownMbps: 500, Obfs: "salamander", ObfsPassword: "obfspass"},
		},
		{
			ID: 5, NodeID: 1, Name: "tuic-in", Tag: "TUIC", Protocol: model.ProtoTUIC,
			Port: 4443, CertID: &certID, Enabled: true,
			Settings: model.InboundSettings{CongestionController: "bbr"},
		},
		{
			ID: 6, NodeID: 1, Name: "anytls-in", Tag: "AnyTLS", Protocol: model.ProtoAnyTLS,
			Port: 5443, CertID: &certID, Enabled: true,
		},
		{
			ID: 7, NodeID: 1, Name: "ss-2022", Tag: "SS2022", Protocol: model.ProtoShadowsocks,
			Port: 6443, Enabled: true,
			Settings: model.InboundSettings{
				SSCipher: "2022-blake3-aes-128-gcm", SSServerPassword: crypto.RandomBase64(16), UDP: true,
			},
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
	if !ok || len(listeners) != 7 {
		t.Fatalf("expected 7 listeners, got %d", len(listeners))
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
	if !ok || len(proxies) != 7 {
		t.Fatalf("expected 7 client proxies, got %d\n%s", len(proxies), subYAML)
	}
}
