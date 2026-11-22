package agent

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mihob/mihob/internal/protocol"
)

func TestCompareSemver(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"v1.19.34", "v1.19.35", -1},
		{"v1.20.0", "v1.19.35", 1},
		{"Meta v1.19.34", "v1.19.34", 0},
		{"v2.0.0", "v1.99.99", 1},
		{"invalid", "v1.0.0", 0},
	}
	for _, tc := range cases {
		if got := compareSemver(tc.a, tc.b); got != tc.want {
			t.Errorf("compareSemver(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestValidateUpgradePayloadSecurity(t *testing.T) {
	validSHA := strings.Repeat("a", 64)
	if err := validateUpgradePayload(&protocol.UpgradeMihomoPayload{
		Version:      "v1.19.35",
		DownloadPath: "/api/agent/mihomo-binary?version=v1.19.35&arch=amd64",
		SHA256:       validSHA,
	}); err != nil {
		t.Fatalf("expected valid payload to pass, got %v", err)
	}

	badPayloads := []*protocol.UpgradeMihomoPayload{
		{Version: "../evil", DownloadPath: "/api/agent/mihomo-binary?version=v1.0.0", SHA256: validSHA},
		{Version: "v1.19.35", DownloadPath: "https://evil.com/bin", SHA256: validSHA},
		{Version: "v1.19.35", DownloadPath: "/api/agent/mihomo-binary?version=../../etc", SHA256: validSHA},
		{Version: "v1.19.35", DownloadPath: "/api/agent/mihomo-binary?version=v1.19.35", SHA256: "short"},
	}
	for i, bp := range badPayloads {
		if err := validateUpgradePayload(bp); err == nil {
			t.Errorf("case %d: expected error for untrusted payload %+v", i, bp)
		}
	}
}

func TestDownloadAndVerifyMihomoSHA256(t *testing.T) {
	rawBin := []byte("fake-mihomo-binary-content")
	var gzBuf bytes.Buffer
	gw := gzip.NewWriter(&gzBuf)
	_, _ = gw.Write(rawBin)
	_ = gw.Close()

	sum := sha256.Sum256(rawBin)
	goodHex := hex.EncodeToString(sum[:])

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Node-Token") != "node-secret" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_, _ = w.Write(gzBuf.Bytes())
	}))
	defer srv.Close()

	tmpDir := t.TempDir()
	dst := filepath.Join(tmpDir, "bin", "mihomo.new")

	// Wrong checksum must fail
	err := downloadAndVerifyMihomo(context.Background(), srv.URL, "node-secret", &protocol.UpgradeMihomoPayload{
		Version:      "v1.19.35",
		DownloadPath: "/api/agent/mihomo-binary?version=v1.19.35&arch=amd64",
		SHA256:       strings.Repeat("0", 64),
	}, dst)
	if err == nil || !strings.Contains(err.Error(), "SHA-256 mismatch") {
		t.Fatalf("expected SHA-256 mismatch error, got %v", err)
	}

	// Matching checksum succeeds
	err = downloadAndVerifyMihomo(context.Background(), srv.URL, "node-secret", &protocol.UpgradeMihomoPayload{
		Version:      "v1.19.35",
		DownloadPath: "/api/agent/mihomo-binary?version=v1.19.35&arch=amd64",
		SHA256:       goodHex,
	}, dst)
	if err != nil {
		t.Fatalf("expected valid download & verify to succeed, got %v", err)
	}
}
