package hub

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/notify"
)

func TestIsDisallowedRemoteIP(t *testing.T) {
	disallowed := []string{
		"127.0.0.1",
		"10.0.0.1",
		"172.16.0.1",
		"192.168.1.1",
		"169.254.169.254",
		"100.64.0.1",
		"100.100.100.200", // Alibaba Cloud metadata
		"0.0.0.0",
		"198.18.0.1",
		"::1",
		"::ffff:100.100.100.200",
		"fe80::1",
		"fc00::1",
	}
	for _, s := range disallowed {
		if !isDisallowedRemoteIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be disallowed", s)
		}
	}

	allowed := []string{
		"1.1.1.1",
		"8.8.8.8",
		"104.21.10.20",
		"2606:4700:4700::1111",
	}
	for _, s := range allowed {
		if isDisallowedRemoteIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be allowed", s)
		}
	}
}

func TestLooksLikeThemePayload(t *testing.T) {
	if !looksLikeThemePayload([]byte(`{"name":"demo","cssVars":{"light":{"primary":"oklch(0.6 0.1 40)"}}}`)) {
		t.Fatal("expected valid registry JSON to pass")
	}
	if !looksLikeThemePayload([]byte(`:root { --primary: #111; --background: #fff; }`)) {
		t.Fatal("expected valid CSS variables to pass")
	}
	if looksLikeThemePayload([]byte(`<html><body>secret internal page</body></html>`)) {
		t.Fatal("expected arbitrary HTML page to be rejected")
	}
	if looksLikeThemePayload([]byte(`{"secret":"aws_access_key"}`)) {
		t.Fatal("expected unrelated JSON to be rejected")
	}
}

func TestSecurityHardeningEndToEnd(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := db.Open(filepath.Join(tmpDir, "sec.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	if _, _, err := store.EnsureAdmin("admin", "secret123"); err != nil {
		t.Fatalf("ensure admin: %v", err)
	}

	srv, err := NewServer(Config{
		Store:   store,
		DataDir: tmpDir,
		Version: "test",
	})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	router := srv.Router()

	doReq := func(method, target, token string, body []byte, extraHeaders map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, bytes.NewReader(body))
		req.RemoteAddr = "203.0.113.50:12345"
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		for k, v := range extraHeaders {
			req.Header.Set(k, v)
		}
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		return rr
	}

	// 1. Security headers & tightened CORS (no wildcard "*")
	rr := doReq(http.MethodGet, "/healthz", "", nil, map[string]string{
		"Origin": "https://evil.example.com",
	})
	if rr.Header().Get("X-Content-Type-Options") != "nosniff" || rr.Header().Get("X-Frame-Options") != "DENY" || rr.Header().Get("Content-Security-Policy") == "" {
		t.Fatalf("missing security headers: %+v", rr.Header())
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected untrusted origin to have empty ACAO, got %q", got)
	}

	// Same-origin CORS should be reflected
	rr = doReq(http.MethodGet, "/healthz", "", nil, map[string]string{
		"Origin": "http://example.com",
	})
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "http://example.com" {
		t.Fatalf("expected same-origin ACAO http://example.com, got %q", got)
	}

	// 2. Login rate limit after 5 consecutive failures
	badBody, _ := json.Marshal(map[string]string{"username": "admin", "password": "wrong"})
	for i := range 5 {
		res := doReq(http.MethodPost, "/api/auth/login", "", badBody, nil)
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d expected 401, got %d", i+1, res.Code)
		}
	}
	locked := doReq(http.MethodPost, "/api/auth/login", "", badBody, nil)
	if locked.Code != http.StatusTooManyRequests || locked.Header().Get("Retry-After") == "" {
		t.Fatalf("expected 429 with Retry-After after consecutive failures, got %d %v", locked.Code, locked.Header())
	}

	// 3. Login from another IP succeeds, password change rotates JWT secret and invalidates old token
	loginBody, _ := json.Marshal(map[string]string{"username": "admin", "password": "secret123"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody))
	req.RemoteAddr = "198.51.100.10:5555"
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", rr.Code, rr.Body.String())
	}
	var loginRes struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &loginRes)
	oldTok := loginRes.Token

	pwBody, _ := json.Marshal(map[string]string{"old_password": "secret123", "new_password": "newSecret456"})
	pwRR := doReq(http.MethodPost, "/api/auth/password", oldTok, pwBody, nil)
	if pwRR.Code != http.StatusOK {
		t.Fatalf("change password failed: %d %s", pwRR.Code, pwRR.Body.String())
	}
	var pwRes struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(pwRR.Body.Bytes(), &pwRes)
	if pwRes.Token == "" || pwRes.Token == oldTok {
		t.Fatalf("expected fresh token after password change, got %q", pwRes.Token)
	}

	// Old token must be rejected now
	if meOld := doReq(http.MethodGet, "/api/auth/me", oldTok, nil, nil); meOld.Code != http.StatusUnauthorized {
		t.Fatalf("expected old token to be rejected with 401, got %d", meOld.Code)
	}
	// New token must succeed
	if meNew := doReq(http.MethodGet, "/api/auth/me", pwRes.Token, nil, nil); meNew.Code != http.StatusOK {
		t.Fatalf("expected new token to succeed, got %d", meNew.Code)
	}

	// 4. Oversized JSON request body rejected (> 2 MiB)
	hugeBody := []byte(`{"username":"` + strings.Repeat("a", maxAPIRequestBodyBytes+1024) + `"}`)
	reqHuge := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(hugeBody))
	reqHuge.RemoteAddr = "198.51.100.20:5555"
	reqHuge.Header.Set("Content-Type", "application/json")
	rrHuge := httptest.NewRecorder()
	router.ServeHTTP(rrHuge, reqHuge)
	if rrHuge.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for oversized JSON body, got %d", rrHuge.Code)
	}

	// 5. WebSocket query ?token= must be rejected
	wsRR := doReq(http.MethodGet, "/ws/agent?token=some-node-token", "", nil, nil)
	if wsRR.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when passing node token via query param, got %d", wsRR.Code)
	}

	// 6. Theme fetch blocks CGNAT / Alibaba metadata IP
	fetchBody, _ := json.Marshal(map[string]string{"url": "http://100.100.100.200/latest/meta-data/"})
	fetchRR := doReq(http.MethodPost, "/api/themes/fetch", pwRes.Token, fetchBody, nil)
	if fetchRR.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for 100.100.100.200 SSRF fetch, got %d", fetchRR.Code)
	}

	// 7. Notification URL validation blocks loopback/metadata by default, allows when opted in
	if err := notify.ValidateURL("generic+http://127.0.0.1:8080/hook"); err == nil {
		t.Fatal("expected loopback generic webhook to be blocked by default")
	}
	if err := notify.ValidateURL("generic+http://169.254.169.254/latest/meta-data/"); err == nil {
		t.Fatal("expected metadata generic webhook to be blocked by default")
	}
	t.Setenv("MIHOB_ALLOW_PRIVATE_WEBHOOK", "true")
	if err := notify.ValidateURL("generic+http://127.0.0.1:8080/hook"); err != nil {
		t.Fatalf("expected loopback webhook allowed when MIHOB_ALLOW_PRIVATE_WEBHOOK=true, got %v", err)
	}
}
