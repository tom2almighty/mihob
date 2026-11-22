package hub

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func makeGzipBytes(t *testing.T, raw []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	if _, err := gw.Write(raw); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := gw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	return buf.Bytes()
}

func TestMihomoReleaseManagerAndGitHubToken(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := db.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	// Persist github_token in settings
	st, _ := store.GetSystemSettings()
	st.GitHubToken = "ghp_test_token_123"
	if err := store.SaveSystemSettings(st); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	loaded, _ := store.GetSystemSettings()
	if loaded.GitHubToken != "ghp_test_token_123" {
		t.Fatalf("expected github_token persisted, got %q", loaded.GitHubToken)
	}

	fakeBinary := []byte("#!/bin/sh\necho 'Mihomo Meta v1.20.0'\n")
	expectedSum := sha256.Sum256(fakeBinary)
	expectedHex := hex.EncodeToString(expectedSum[:])
	gzBytes := makeGzipBytes(t, fakeBinary)

	var seenAuthHeader string
	var dlCount int
	var ghSrv *httptest.Server
	ghSrv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/releases/latest", "/releases/tags/v1.20.0":
			seenAuthHeader = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(githubRelease{
				TagName:     "v1.20.0",
				HTMLURL:     "https://github.com/MetaCubeX/mihomo/releases/tag/v1.20.0",
				PublishedAt: "2026-01-01T00:00:00Z",
				Assets: []githubReleaseAsset{
					{
						Name:               "mihomo-linux-amd64-v1.20.0.gz",
						BrowserDownloadURL: ghSrv.URL + "/download/mihomo-linux-amd64-v1.20.0.gz",
					},
					{
						Name:               "mihomo-linux-arm64-v1.20.0.gz",
						BrowserDownloadURL: ghSrv.URL + "/download/mihomo-linux-arm64-v1.20.0.gz",
					},
				},
			})
		case "/download/mihomo-linux-amd64-v1.20.0.gz":
			dlCount++
			w.Header().Set("Content-Type", "application/gzip")
			_, _ = w.Write(gzBytes)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ghSrv.Close()

	mgr := NewMihomoReleaseManager(store, tmpDir)
	mgr.apiBaseURL = ghSrv.URL + "/releases"

	info, err := mgr.GetLatestRelease(context.Background(), true)
	if err != nil {
		t.Fatalf("GetLatestRelease failed: %v", err)
	}
	if info.Version != "v1.20.0" || len(info.Assets) != 2 {
		t.Fatalf("unexpected release info: %+v", info)
	}
	if seenAuthHeader != "Bearer ghp_test_token_123" {
		t.Fatalf("expected Bearer github token header, got %q", seenAuthHeader)
	}

	// First download caches binary + SHA-256
	cached, err := mgr.EnsureBinaryCached(context.Background(), "v1.20.0", "amd64")
	if err != nil {
		t.Fatalf("EnsureBinaryCached failed: %v", err)
	}
	if cached.SHA256 != expectedHex {
		t.Fatalf("expected sha256 %s, got %s", expectedHex, cached.SHA256)
	}
	// Second call hits disk cache without re-downloading
	cached2, err := mgr.EnsureBinaryCached(context.Background(), "v1.20.0", "amd64")
	if err != nil || cached2.SHA256 != expectedHex {
		t.Fatalf("second EnsureBinaryCached failed: %v", err)
	}
	if dlCount != 1 {
		t.Fatalf("expected exactly 1 upstream download due to cache, got %d", dlCount)
	}

	// Reject invalid version & unsupported arch
	if _, err := mgr.EnsureBinaryCached(context.Background(), "../../etc/passwd", "amd64"); err == nil {
		t.Fatalf("expected error for invalid version")
	}
	if _, err := mgr.EnsureBinaryCached(context.Background(), "v1.20.0", "386"); err == nil {
		t.Fatalf("expected error for unsupported arch")
	}

	// Verify agent download endpoint requires valid X-Node-Token
	srv, err := NewServer(Config{Store: store, DataDir: tmpDir, Version: "test"})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	srv.mihomo = mgr
	node := &model.Node{Name: "n1", Host: "1.2.3.4", Enabled: true}
	if err := store.CreateNode(node); err != nil {
		t.Fatalf("create node: %v", err)
	}

	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	// Without token -> 401
	resp, err := http.Get(ts.URL + "/api/agent/mihomo-binary?version=v1.20.0&arch=amd64")
	if err != nil {
		t.Fatalf("get without token: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", resp.StatusCode)
	}

	// With valid node token -> 200 + matching SHA256 header
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/agent/mihomo-binary?version=v1.20.0&arch=amd64", nil)
	req.Header.Set("X-Node-Token", node.Token)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get with token: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 with valid node token, got %d", resp.StatusCode)
	}
	if resp.Header.Get("X-Mihomo-SHA256") != expectedHex {
		t.Fatalf("expected header sha256 %s, got %s", expectedHex, resp.Header.Get("X-Mihomo-SHA256"))
	}
}
