package hub

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func TestHubEndToEndAPIAndSubscription(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := db.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	if _, _, err := store.EnsureAdmin("admin", "secret123"); err != nil {
		t.Fatalf("ensure admin: %v", err)
	}

	mockWebFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html><body>mihob-spa</body></html>")},
	}

	srv, err := NewServer(Config{
		Store:   store,
		DataDir: tmpDir,
		WebFS:   mockWebFS,
		Version: "test",
	})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	doJSON := func(method, path, token string, body any) (*http.Response, []byte) {
		var r io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			r = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, ts.URL+path, r)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s failed: %v", method, path, err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		return resp, raw
	}

	// 1. Login
	resp, raw := doJSON(http.MethodPost, "/api/auth/login", "", map[string]string{
		"username": "admin",
		"password": "secret123",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login failed: %d %s", resp.StatusCode, string(raw))
	}
	var loginRes struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(raw, &loginRes)
	tok := loginRes.Token
	if tok == "" {
		t.Fatalf("expected non-empty jwt token")
	}

	// 2. Create self-signed cert
	resp, raw = doJSON(http.MethodPost, "/api/certificates", tok, map[string]any{
		"name":   "JP TLS Cert",
		"source": "self_signed",
		"domain": "jp.example.com",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create cert failed: %d %s", resp.StatusCode, string(raw))
	}
	var cert model.Certificate
	_ = json.Unmarshal(raw, &cert)

	// 3. Create node
	resp, raw = doJSON(http.MethodPost, "/api/nodes", tok, map[string]any{
		"name":               "Japan-01",
		"host":               "jp.example.com",
		"region":             "JP",
		"traffic_limit":      100 * 1024 * 1024 * 1024,
		"traffic_multiplier": 1.0,
		"reset_day":          1,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create node failed: %d %s", resp.StatusCode, string(raw))
	}
	var node model.Node
	_ = json.Unmarshal(raw, &node)

	// 4. Add VLESS Reality + Hysteria2 + Shadowsocks 2022 inbounds
	inbounds := []map[string]any{
		{
			"name":     "vless-443",
			"tag":      "Reality",
			"protocol": "vless",
			"port":     443,
			"settings": map[string]any{
				"security":     "reality",
				"network":      "tcp",
				"flow":         "xtls-rprx-vision",
				"reality_dest": "www.microsoft.com:443",
			},
		},
		{
			"name":     "hy2-8443",
			"tag":      "HY2",
			"protocol": "hysteria2",
			"port":     8443,
			"cert_id":  cert.ID,
			"settings": map[string]any{
				"up_mbps":   100,
				"down_mbps": 500,
			},
		},
		{
			"name":     "ss-9443",
			"tag":      "SS2022",
			"protocol": "shadowsocks",
			"port":     9443,
			"settings": map[string]any{
				"ss_cipher": "2022-blake3-aes-128-gcm",
				"udp":       true,
			},
		},
	}
	for _, inb := range inbounds {
		r, b := doJSON(http.MethodPost, fmt.Sprintf("/api/nodes/%d/inbounds", node.ID), tok, inb)
		if r.StatusCode != http.StatusCreated {
			t.Fatalf("create inbound failed: %d %s", r.StatusCode, string(b))
		}
	}

	// 5. Verify install commands endpoint
	resp, raw = doJSON(http.MethodGet, fmt.Sprintf("/api/nodes/%d/install", node.ID), tok, nil)
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(raw), "docker_compose") {
		t.Fatalf("install commands failed: %d %s", resp.StatusCode, string(raw))
	}

	// 6. Create user authorized on this node
	resp, raw = doJSON(http.MethodPost, "/api/users", tok, map[string]any{
		"username":      "alice",
		"traffic_limit": 50 * 1024 * 1024 * 1024,
		"node_ids":      []int64{node.ID},
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create user failed: %d %s", resp.StatusCode, string(raw))
	}
	var user model.User
	_ = json.Unmarshal(raw, &user)

	// 7. Fetch public Mihomo subscription as client (YAML)
	subResp, err := http.Get(ts.URL + "/sub/" + user.SubToken)
	if err != nil {
		t.Fatalf("get sub failed: %v", err)
	}
	defer subResp.Body.Close()
	subRaw, _ := io.ReadAll(subResp.Body)
	if subResp.StatusCode != http.StatusOK {
		t.Fatalf("sub status %d: %s", subResp.StatusCode, string(subRaw))
	}
	if !strings.Contains(subResp.Header.Get("Subscription-Userinfo"), "total=") {
		t.Fatalf("missing Subscription-Userinfo header: %q", subResp.Header.Get("Subscription-Userinfo"))
	}

	var parsed map[string]any
	if err := yaml.Unmarshal(subRaw, &parsed); err != nil {
		t.Fatalf("invalid subscription YAML: %v\n%s", err, string(subRaw))
	}
	proxies, ok := parsed["proxies"].([]any)
	if !ok || len(proxies) != 3 {
		t.Fatalf("expected 3 proxies in subscription, got %d\n%s", len(proxies), string(subRaw))
	}

	// 8. Browser visit to /sub/{token} should return SPA HTML (subscription info page)
	browserReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/sub/"+user.SubToken, nil)
	browserReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0")
	browserReq.Header.Set("Accept", "text/html,application/xhtml+xml")
	browserResp, err := http.DefaultClient.Do(browserReq)
	if err != nil {
		t.Fatalf("browser get sub failed: %v", err)
	}
	browserRaw, _ := io.ReadAll(browserResp.Body)
	_ = browserResp.Body.Close()
	if !strings.Contains(browserResp.Header.Get("Content-Type"), "text/html") || !strings.Contains(string(browserRaw), "mihob-spa") {
		t.Fatalf("expected SPA HTML for browser visit, got ct=%q body=%q", browserResp.Header.Get("Content-Type"), string(browserRaw))
	}

	// 9. Update custom sub_path & verify custom path + public sub info API
	resp, raw = doJSON(http.MethodPut, "/api/settings", tok, map[string]any{
		"agent_image": "ghcr.io/mihob/mihob-agent:latest",
		"sub_path":    "/custom/s/",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("update settings failed: %d %s", resp.StatusCode, string(raw))
	}
	var updatedSt model.SystemSettings
	_ = json.Unmarshal(raw, &updatedSt)
	if updatedSt.SubPath != "custom/s" {
		t.Fatalf("expected normalized sub_path custom/s, got %q", updatedSt.SubPath)
	}

	// Public sub info endpoint on new custom path
	resp, raw = doJSON(http.MethodGet, "/api/public/sub?path=/custom/s/"+user.SubToken, "", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("public sub info failed: %d %s", resp.StatusCode, string(raw))
	}
	var pubInfo model.PublicSubInfo
	if err := json.Unmarshal(raw, &pubInfo); err != nil {
		t.Fatalf("decode public sub info: %v", err)
	}
	if pubInfo.Username != "alice" || len(pubInfo.Nodes) != 1 || len(pubInfo.Nodes[0].Protocols) != 3 || pubInfo.YAML == "" {
		t.Fatalf("unexpected public sub info: %+v", pubInfo)
	}

	// Client YAML download on new custom path
	customResp, err := http.Get(ts.URL + "/custom/s/" + user.SubToken + "?download=1")
	if err != nil {
		t.Fatalf("custom path download failed: %v", err)
	}
	customRaw, _ := io.ReadAll(customResp.Body)
	_ = customResp.Body.Close()
	if customResp.StatusCode != http.StatusOK || !strings.Contains(string(customRaw), "proxies:") {
		t.Fatalf("expected YAML on custom path, got %d %s", customResp.StatusCode, string(customRaw))
	}

	// Reserved path should be rejected
	resp, _ = doJSON(http.MethodPut, "/api/settings", tok, map[string]any{
		"agent_image": "ghcr.io/mihob/mihob-agent:latest",
		"sub_path":    "api/sub",
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for reserved sub_path, got %d", resp.StatusCode)
	}

	// 10. Check dashboard endpoint
	resp, raw = doJSON(http.MethodGet, "/api/dashboard", tok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dashboard failed: %d %s", resp.StatusCode, string(raw))
	}
}
