package agent

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mihob/mihob/internal/protocol"
)

const (
	maxUpgradeDecompressedBytes = 200 * 1024 * 1024 // 200 MB safety ceiling
	upgradeHealthWaitTimeout    = 12 * time.Second
)

var (
	semverExtractRe = regexp.MustCompile(`v?(\d+)\.(\d+)\.(\d+)`)
	upgradeVerRe    = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9._-]+)?$`)
	sha256HexRe     = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)
)

func parseSemverTuple(raw string) (major, minor, patch int, ok bool) {
	m := semverExtractRe.FindStringSubmatch(raw)
	if len(m) != 4 {
		return 0, 0, 0, false
	}
	maj, err1 := strconv.Atoi(m[1])
	minV, err2 := strconv.Atoi(m[2])
	pat, err3 := strconv.Atoi(m[3])
	if err1 != nil || err2 != nil || err3 != nil {
		return 0, 0, 0, false
	}
	return maj, minV, pat, true
}

// compareSemver returns 1 if a > b, -1 if a < b, 0 if equal or unparseable.
func compareSemver(a, b string) int {
	aMaj, aMin, aPat, aOK := parseSemverTuple(a)
	bMaj, bMin, bPat, bOK := parseSemverTuple(b)
	if !aOK || !bOK {
		return 0
	}
	if aMaj != bMaj {
		if aMaj > bMaj {
			return 1
		}
		return -1
	}
	if aMin != bMin {
		if aMin > bMin {
			return 1
		}
		return -1
	}
	if aPat != bPat {
		if aPat > bPat {
			return 1
		}
		return -1
	}
	return 0
}

func probeBinaryVersion(binPath string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, binPath, "-v").CombinedOutput()
	if err != nil {
		return ""
	}
	m := semverExtractRe.FindString(string(out))
	if m == "" {
		return ""
	}
	if !strings.HasPrefix(m, "v") {
		m = "v" + m
	}
	return m
}

func resolveInitialMihomoBin(defaultBin, managedBin string) string {
	info, err := os.Stat(managedBin)
	if err != nil || info.IsDir() {
		return defaultBin
	}
	managedVer := probeBinaryVersion(managedBin)
	if managedVer == "" {
		return defaultBin
	}
	defaultVer := probeBinaryVersion(defaultBin)
	if defaultVer != "" && compareSemver(defaultVer, managedVer) > 0 {
		log.Printf("[mihomo] bundled binary (%s, %s) is newer than managed (%s); using bundled", defaultBin, defaultVer, managedVer)
		return defaultBin
	}
	log.Printf("[mihomo] using managed binary %s (%s)", managedBin, managedVer)
	return managedBin
}

func validateUpgradePayload(p *protocol.UpgradeMihomoPayload) error {
	if p == nil {
		return errors.New("empty upgrade payload")
	}
	if !upgradeVerRe.MatchString(strings.TrimSpace(p.Version)) {
		return fmt.Errorf("invalid target version %q", p.Version)
	}
	if !sha256HexRe.MatchString(strings.TrimSpace(p.SHA256)) {
		return errors.New("invalid or missing SHA-256 checksum")
	}
	if !strings.HasPrefix(p.DownloadPath, "/api/agent/mihomo-binary?") || strings.Contains(p.DownloadPath, "..") {
		return errors.New("untrusted download path")
	}
	return nil
}

func downloadAndVerifyMihomo(ctx context.Context, hubURL, nodeToken string, p *protocol.UpgradeMihomoPayload, dstPath string) error {
	fullURL := strings.TrimRight(strings.TrimSpace(hubURL), "/") + p.DownloadPath

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return fmt.Errorf("build download request: %w", err)
	}
	req.Header.Set("X-Node-Token", nodeToken)

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download from hub: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("hub returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}

	gr, err := gzip.NewReader(resp.Body)
	if err != nil {
		return fmt.Errorf("invalid gzip stream: %w", err)
	}
	defer gr.Close()

	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return fmt.Errorf("create bin dir: %w", err)
	}
	outFile, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return fmt.Errorf("create temp binary: %w", err)
	}

	hasher := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(outFile, hasher), io.LimitReader(gr, maxUpgradeDecompressedBytes+1))
	closeErr := outFile.Close()
	if copyErr != nil {
		_ = os.Remove(dstPath)
		return fmt.Errorf("extract binary: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(dstPath)
		return closeErr
	}
	if written == 0 {
		_ = os.Remove(dstPath)
		return errors.New("extracted binary is empty")
	}
	if written > maxUpgradeDecompressedBytes {
		_ = os.Remove(dstPath)
		return errors.New("extracted binary exceeds size limit")
	}

	actualSum := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(actualSum, strings.TrimSpace(p.SHA256)) {
		_ = os.Remove(dstPath)
		return fmt.Errorf("SHA-256 mismatch: expected %s, got %s", p.SHA256, actualSum)
	}
	return nil
}

func copyFileAtomic(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return err
	}
	return out.Close()
}

// UpgradeMihomo safely downloads, verifies, pre-validates, atomically swaps, restarts,
// and health-checks the new mihomo binary. On any failure it automatically rolls back.
func (s *MihomoSupervisor) UpgradeMihomo(ctx context.Context, hubURL, nodeToken string, p *protocol.UpgradeMihomoPayload) (string, error) {
	if !s.upgradeMu.TryLock() {
		return "", errors.New("mihomo upgrade already in progress")
	}
	defer s.upgradeMu.Unlock()

	if err := validateUpgradePayload(p); err != nil {
		return "", err
	}

	newPath := s.managedBinPath + ".new"
	bakPath := s.managedBinPath + ".bak"
	_ = os.Remove(newPath)

	log.Printf("[mihomo-upgrade] downloading %s from hub...", p.Version)
	if err := downloadAndVerifyMihomo(ctx, hubURL, nodeToken, p, newPath); err != nil {
		return "", err
	}
	defer func() { _ = os.Remove(newPath) }()

	// Pre-flight 1: verify binary executes on this host
	probedVer := probeBinaryVersion(newPath)
	if probedVer == "" {
		return "", errors.New("pre-flight check failed: downloaded mihomo binary cannot execute")
	}

	// Pre-flight 2: validate current active config.yaml against the new binary before stopping current process
	cfgPath := filepath.Join(s.dataDir, "config.yaml")
	if _, err := os.Stat(cfgPath); err == nil {
		vCtx, vCancel := context.WithTimeout(ctx, 15*time.Second)
		out, err := exec.CommandContext(vCtx, newPath, "-t", "-d", s.dataDir, "-f", cfgPath).CombinedOutput()
		vCancel()
		if err != nil {
			return "", fmt.Errorf("pre-flight config validation failed: %s", strings.TrimSpace(string(out)))
		}
	}

	// Backup previous managed binary (if any) and atomically install new binary
	prevBin := s.currentBinPath()
	hadManaged := false
	if _, err := os.Stat(s.managedBinPath); err == nil {
		hadManaged = true
		if err := copyFileAtomic(s.managedBinPath, bakPath, 0o755); err != nil {
			return "", fmt.Errorf("backup previous binary: %w", err)
		}
	}

	if err := os.Rename(newPath, s.managedBinPath); err != nil {
		return "", fmt.Errorf("install new binary: %w", err)
	}

	s.setBinPath(s.managedBinPath)
	s.Restart()

	// Post-restart health check
	liveVer, err := s.waitHealthy(ctx, upgradeHealthWaitTimeout)
	if err != nil {
		log.Printf("[mihomo-upgrade] health check failed (%v); rolling back to previous binary", err)
		if hadManaged {
			_ = os.Rename(bakPath, s.managedBinPath)
		} else {
			_ = os.Remove(s.managedBinPath)
		}
		s.setBinPath(prevBin)
		s.Restart()
		return "", fmt.Errorf("new mihomo %s failed health check and was rolled back: %w", p.Version, err)
	}

	_ = os.Remove(bakPath)
	s.mu.Lock()
	s.version = liveVer
	s.mu.Unlock()
	log.Printf("[mihomo-upgrade] upgraded successfully to %s (live=%s)", p.Version, liveVer)
	return liveVer, nil
}

func (s *MihomoSupervisor) waitHealthy(ctx context.Context, timeout time.Duration) (string, error) {
	// Allow brief grace period for supervisor loop to terminate old process & spawn new one
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(900 * time.Millisecond):
	}

	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		running, _, _ := s.Status()
		if running {
			ver, err := s.FetchVersion()
			if err == nil && ver != "" {
				return ver, nil
			}
			lastErr = err
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", errors.New("timed out waiting for mihomo to become healthy")
}
