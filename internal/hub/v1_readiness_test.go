package hub

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func TestEnsureAdminGeneratesRandomPassword(t *testing.T) {
	openFresh := func() string {
		store, err := db.Open(filepath.Join(t.TempDir(), "mihob.db"))
		if err != nil {
			t.Fatalf("open db: %v", err)
		}
		defer store.Close()

		created, pw, err := store.EnsureAdmin("admin", "")
		if err != nil {
			t.Fatalf("ensure admin: %v", err)
		}
		if !created {
			t.Fatalf("expected admin to be created")
		}
		if pw == "" || pw == "mihob123456" || len(pw) < 12 {
			t.Fatalf("expected strong random initial password, got %q", pw)
		}
		return pw
	}

	pw1 := openFresh()
	pw2 := openFresh()
	if pw1 == pw2 {
		t.Fatalf("expected distinct random passwords across fresh databases, both got %q", pw1)
	}
}

func TestSanitizeDownloadFilename(t *testing.T) {
	cases := map[string]string{
		"alice":               "alice",
		"alice.bob_1-2":       "alice.bob_1-2",
		"evil\"\r\nX-Inject:": "evil___X-Inject",
		"../../etc/passwd":    "etc_passwd",
		"   ":                 "user",
	}
	for in, want := range cases {
		if got := sanitizeDownloadFilename(in); got != want {
			t.Fatalf("sanitizeDownloadFilename(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTrafficRetentionDaysConfig(t *testing.T) {
	t.Setenv("MIHOB_TRAFFIC_RETENTION_DAYS", "")
	if got := trafficRetentionDays(); got != defaultTrafficRetentionDays {
		t.Fatalf("default retention = %d, want %d", got, defaultTrafficRetentionDays)
	}
	t.Setenv("MIHOB_TRAFFIC_RETENTION_DAYS", "180")
	if got := trafficRetentionDays(); got != 180 {
		t.Fatalf("custom retention = %d, want 180", got)
	}
	t.Setenv("MIHOB_TRAFFIC_RETENTION_DAYS", "0")
	if got := trafficRetentionDays(); got != 0 {
		t.Fatalf("disabled retention = %d, want 0", got)
	}
}

func TestSettingsTokenMaskingAndDatabaseBackup(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := db.Open(filepath.Join(tmpDir, "hub.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	if _, _, err := store.EnsureAdmin("admin", "strongPass!123"); err != nil {
		t.Fatalf("ensure admin: %v", err)
	}

	srv, err := NewServer(Config{
		Store:   store,
		DataDir: tmpDir,
		Version: "1.0.0",
	})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	defer srv.Shutdown()

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

	// Login
	resp, raw := doJSON(http.MethodPost, "/api/auth/login", "", map[string]string{
		"username": "admin",
		"password": "strongPass!123",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login failed: %d %s", resp.StatusCode, string(raw))
	}
	var loginRes struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(raw, &loginRes)
	tok := loginRes.Token

	// 1. Save settings with GitHub token -> response should mask token
	resp, raw = doJSON(http.MethodPut, "/api/settings", tok, map[string]any{
		"agent_image":  "ghcr.io/tom2almighty/mihob-agent:latest",
		"sub_path":     "sub",
		"github_token": "ghp_1234567890abcdef",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("put settings failed: %d %s", resp.StatusCode, string(raw))
	}
	var st model.SystemSettings
	_ = json.Unmarshal(raw, &st)
	if st.GitHubToken != "" || !st.HasGitHubToken || strings.Contains(st.GitHubTokenMasked, "1234567890") {
		t.Fatalf("expected masked github token in PUT response, got %+v", st)
	}

	// 2. GET /api/settings should also mask token
	resp, raw = doJSON(http.MethodGet, "/api/settings", tok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get settings failed: %d %s", resp.StatusCode, string(raw))
	}
	st = model.SystemSettings{}
	_ = json.Unmarshal(raw, &st)
	if st.GitHubToken != "" || !st.HasGitHubToken || st.GitHubTokenMasked != "ghp_****cdef" {
		t.Fatalf("unexpected masked GET settings: %+v", st)
	}

	// 3. Updating other settings with empty github_token preserves stored token
	resp, _ = doJSON(http.MethodPut, "/api/settings", tok, map[string]any{
		"agent_image": "ghcr.io/tom2almighty/mihob-agent:latest",
		"sub_path":    "sub",
		"acme_email":  "ops@example.com",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("preserve token update failed: %d", resp.StatusCode)
	}
	stored, _ := store.GetSystemSettings()
	if stored.GitHubToken != "ghp_1234567890abcdef" {
		t.Fatalf("expected stored github_token preserved, got %q", stored.GitHubToken)
	}

	// 4. Explicit clear_github_token clears stored token
	resp, raw = doJSON(http.MethodPut, "/api/settings", tok, map[string]any{
		"agent_image":        "ghcr.io/tom2almighty/mihob-agent:latest",
		"sub_path":           "sub",
		"acme_email":         "ops@example.com",
		"clear_github_token": true,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("clear token update failed: %d %s", resp.StatusCode, string(raw))
	}
	stored, _ = store.GetSystemSettings()
	if stored.GitHubToken != "" {
		t.Fatalf("expected github_token cleared, got %q", stored.GitHubToken)
	}

	// 5. Database backup endpoint returns a valid standalone SQLite database
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/settings/backup", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	bResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("backup request failed: %v", err)
	}
	defer bResp.Body.Close()
	bBytes, _ := io.ReadAll(bResp.Body)
	if bResp.StatusCode != http.StatusOK {
		t.Fatalf("backup returned %d: %s", bResp.StatusCode, string(bBytes))
	}
	if !strings.HasPrefix(string(bBytes), "SQLite format 3\x00") {
		t.Fatalf("backup response is not a valid SQLite file (len=%d)", len(bBytes))
	}

	restoredPath := filepath.Join(t.TempDir(), "restored.db")
	if err := os.WriteFile(restoredPath, bBytes, 0o600); err != nil {
		t.Fatalf("write restored backup: %v", err)
	}
	restoredStore, err := db.Open(restoredPath)
	if err != nil {
		t.Fatalf("open restored backup db: %v", err)
	}
	defer restoredStore.Close()
	restoredSt, err := restoredStore.GetSystemSettings()
	if err != nil || restoredSt.ACMEEmail != "ops@example.com" {
		t.Fatalf("expected restored settings to contain acme_email=ops@example.com, got %+v (err=%v)", restoredSt, err)
	}
}
