package hub

import (
	"archive/zip"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

var ruleSetNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)

type RuleSetManager struct {
	store    *db.Store
	mihomo   *MihomoReleaseManager
	rulesDir string
	cacheDir string
	binMu    sync.Mutex
}

func NewRuleSetManager(store *db.Store, mihomo *MihomoReleaseManager, dataDir string) *RuleSetManager {
	return &RuleSetManager{
		store:    store,
		mihomo:   mihomo,
		rulesDir: filepath.Join(dataDir, "rulesets"),
		cacheDir: filepath.Join(dataDir, "mihomo-cache"),
	}
}

func isValidRuleSetName(name string) bool {
	if !ruleSetNamePattern.MatchString(name) {
		return false
	}
	return !strings.Contains(name, "..")
}

func normalizeRuleSetBehavior(b string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(b)) {
	case "domain":
		return "domain", nil
	case "ipcidr":
		return "ipcidr", nil
	default:
		return "", errors.New("behavior must be 'domain' or 'ipcidr'")
	}
}

func cleanRuleSetLines(raw string) ([]string, string) {
	lines := make([]string, 0)
	for line := range strings.SplitSeq(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "//") {
			continue
		}
		lines = append(lines, trimmed)
	}
	return lines, strings.Join(lines, "\n") + "\n"
}

func (m *RuleSetManager) mrsPath(name string) string {
	return filepath.Join(m.rulesDir, name+".mrs")
}

func (m *RuleSetManager) RemoveFile(name string) {
	if isValidRuleSetName(name) {
		_ = os.Remove(m.mrsPath(name))
	}
}

func (m *RuleSetManager) ensureHubMihomoBinary(ctx context.Context) (string, error) {
	// 1. Explicit env override
	if custom := strings.TrimSpace(os.Getenv("MIHOB_MIHOMO_BIN")); custom != "" {
		if _, err := os.Stat(custom); err == nil {
			return custom, nil
		}
	}
	// 2. System PATH
	if found, err := exec.LookPath("mihomo"); err == nil {
		return found, nil
	}

	m.binMu.Lock()
	defer m.binMu.Unlock()

	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	cachedBin := filepath.Join(m.cacheDir, "hub-mihomo"+ext)
	if info, err := os.Stat(cachedBin); err == nil && !info.IsDir() && info.Size() > 1024*1024 {
		return cachedBin, nil
	}

	if m.mihomo == nil {
		return "", errors.New("mihomo binary not found and release manager unavailable")
	}
	if err := os.MkdirAll(m.cacheDir, 0o755); err != nil {
		return "", fmt.Errorf("create mihomo cache dir: %w", err)
	}

	relInfo, err := m.mihomo.GetLatestRelease(ctx, false)
	if err != nil {
		return "", fmt.Errorf("fetch latest mihomo release for MRS compiler: %w", err)
	}
	version := relInfo.Version

	// Re-fetch raw release metadata to locate matching GOOS/GOARCH asset
	m.mihomo.metaMu.RLock()
	rel := m.mihomo.latestRaw
	m.mihomo.metaMu.RUnlock()
	if rel == nil {
		return "", errors.New("release asset metadata unavailable")
	}

	assetName, isZip, err := hubMihomoAssetName(runtime.GOOS, runtime.GOARCH, version)
	if err != nil {
		return "", err
	}
	var downloadURL string
	for _, a := range rel.Assets {
		if a.Name == assetName {
			downloadURL = a.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" {
		return "", fmt.Errorf("mihomo asset %s not found in %s", assetName, version)
	}

	st, _ := m.store.GetSystemSettings()
	var ghToken, ghProxy string
	if st != nil {
		ghToken = strings.TrimSpace(st.GitHubToken)
		ghProxy = normalizeGitHubProxy(st.GitHubProxy)
	}
	fetchURL := applyGitHubProxyToURL(downloadURL, ghProxy)

	dlClient := newSafeThemeHTTPClient()
	dlClient.Timeout = 120 * time.Second
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fetchURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "mihob-hub")
	if ghProxy == "" && ghToken != "" {
		req.Header.Set("Authorization", "Bearer "+ghToken)
	}

	resp, err := dlClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("download mihomo (%s): %w", assetName, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download mihomo failed: HTTP %d", resp.StatusCode)
	}

	tmpArchive := cachedBin + ".archive.tmp"
	af, err := os.OpenFile(tmpArchive, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(af, io.LimitReader(resp.Body, maxMihomoArchiveBytes))
	closeErr := af.Close()
	defer os.Remove(tmpArchive)
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}

	tmpBin := cachedBin + ".tmp"
	if isZip {
		if err := extractSingleZipBinary(tmpArchive, tmpBin); err != nil {
			_ = os.Remove(tmpBin)
			return "", err
		}
	} else {
		if err := extractSingleGzipBinary(tmpArchive, tmpBin); err != nil {
			_ = os.Remove(tmpBin)
			return "", err
		}
	}
	if runtime.GOOS != "windows" {
		_ = os.Chmod(tmpBin, 0o755)
	}
	if err := os.Rename(tmpBin, cachedBin); err != nil {
		_ = os.Remove(tmpBin)
		return "", err
	}
	return cachedBin, nil
}

func hubMihomoAssetName(goos, goarch, version string) (name string, isZip bool, err error) {
	switch goos {
	case "linux":
		if goarch != "amd64" && goarch != "arm64" {
			return "", false, fmt.Errorf("unsupported linux arch %s", goarch)
		}
		return fmt.Sprintf("mihomo-linux-%s-%s.gz", goarch, version), false, nil
	case "darwin":
		if goarch != "amd64" && goarch != "arm64" {
			return "", false, fmt.Errorf("unsupported darwin arch %s", goarch)
		}
		return fmt.Sprintf("mihomo-darwin-%s-%s.gz", goarch, version), false, nil
	case "windows":
		if goarch != "amd64" && goarch != "arm64" {
			return "", false, fmt.Errorf("unsupported windows arch %s", goarch)
		}
		return fmt.Sprintf("mihomo-windows-%s-%s.zip", goarch, version), true, nil
	default:
		return "", false, fmt.Errorf("unsupported OS %s for auto mihomo download", goos)
	}
}

func extractSingleGzipBinary(gzPath, dstPath string) error {
	src, err := os.Open(gzPath)
	if err != nil {
		return err
	}
	defer src.Close()
	gzr, err := gzip.NewReader(src)
	if err != nil {
		return fmt.Errorf("open gzip: %w", err)
	}
	defer gzr.Close()
	dst, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, err = io.Copy(dst, io.LimitReader(gzr, maxMihomoBinaryBytes))
	if cErr := dst.Close(); err == nil {
		err = cErr
	}
	return err
}

func extractSingleZipBinary(zipPath, dstPath string) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	defer zr.Close()
	for _, f := range zr.File {
		if f.FileInfo().IsDir() || !strings.HasSuffix(strings.ToLower(f.Name), ".exe") {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		dst, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			_ = rc.Close()
			return err
		}
		_, copyErr := io.Copy(dst, io.LimitReader(rc, maxMihomoBinaryBytes))
		_ = rc.Close()
		closeErr := dst.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	return errors.New("no executable found in mihomo zip archive")
}

// Compile converts rs.RulesText into a standard Mihomo .mrs binary stored at {dataDir}/rulesets/{name}.mrs.
func (m *RuleSetManager) Compile(ctx context.Context, rs *model.RuleSet) error {
	lines, cleaned := cleanRuleSetLines(rs.RulesText)
	if len(lines) == 0 {
		return errors.New("at least one valid rule line is required")
	}
	behavior, err := normalizeRuleSetBehavior(rs.Behavior)
	if err != nil {
		return err
	}
	rs.Behavior = behavior
	rs.RuleCount = len(lines)

	binPath, err := m.ensureHubMihomoBinary(ctx)
	if err != nil {
		rs.LastError = err.Error()
		return err
	}
	if err := os.MkdirAll(m.rulesDir, 0o755); err != nil {
		rs.LastError = err.Error()
		return err
	}

	tmpDir, err := os.MkdirTemp("", "mihob-mrs-*")
	if err != nil {
		rs.LastError = err.Error()
		return err
	}
	defer os.RemoveAll(tmpDir)

	inFile := filepath.Join(tmpDir, "rules.txt")
	outFile := filepath.Join(tmpDir, rs.Name+".mrs")
	if err := os.WriteFile(inFile, []byte(cleaned), 0o600); err != nil {
		rs.LastError = err.Error()
		return err
	}

	runCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(runCtx, binPath, "convert-ruleset", behavior, "text", inFile, outFile)
	outBytes, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(outBytes))
		if msg == "" {
			msg = err.Error()
		}
		rs.LastError = msg
		return fmt.Errorf("mihomo convert-ruleset failed: %s", msg)
	}

	mrsBytes, err := os.ReadFile(outFile)
	if err != nil {
		rs.LastError = err.Error()
		return err
	}
	dstPath := m.mrsPath(rs.Name)
	tmpDst := dstPath + ".tmp"
	if err := os.WriteFile(tmpDst, mrsBytes, 0o644); err != nil {
		rs.LastError = err.Error()
		return err
	}
	if err := os.Rename(tmpDst, dstPath); err != nil {
		_ = os.Remove(tmpDst)
		rs.LastError = err.Error()
		return err
	}

	now := time.Now().UTC()
	rs.MRSSize = int64(len(mrsBytes))
	rs.CompiledAt = &now
	rs.LastError = ""
	return nil
}

// --- HTTP Handlers ---

func (s *Server) handleListRuleSets(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListRuleSets()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleCreateRuleSet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Behavior    string `json:"behavior"`
		Description string `json:"description"`
		RulesText   string `json:"rules_text"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if !isValidRuleSetName(name) {
		writeError(w, http.StatusBadRequest, "invalid rule set name (letters, digits, ._- only)")
		return
	}
	behavior, err := normalizeRuleSetBehavior(req.Behavior)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	lines, _ := cleanRuleSetLines(req.RulesText)
	if len(lines) == 0 {
		writeError(w, http.StatusBadRequest, "at least one rule line is required")
		return
	}

	rs := &model.RuleSet{
		Name:        name,
		Behavior:    behavior,
		Description: strings.TrimSpace(req.Description),
		RulesText:   req.RulesText,
		RuleCount:   len(lines),
	}
	if err := s.store.CreateRuleSet(rs); err != nil {
		writeError(w, http.StatusConflict, "rule set already exists or invalid: "+err.Error())
		return
	}
	if compileErr := s.rulesets.Compile(r.Context(), rs); compileErr != nil {
		_ = s.store.UpdateRuleSet(rs)
		writeJSON(w, http.StatusCreated, rs)
		return
	}
	_ = s.store.UpdateRuleSet(rs)
	writeJSON(w, http.StatusCreated, rs)
}

func (s *Server) handleUpdateRuleSet(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid rule set id")
		return
	}
	existing, err := s.store.GetRuleSet(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "rule set not found")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Behavior    string `json:"behavior"`
		Description string `json:"description"`
		RulesText   string `json:"rules_text"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if !isValidRuleSetName(name) {
		writeError(w, http.StatusBadRequest, "invalid rule set name (letters, digits, ._- only)")
		return
	}
	behavior, err := normalizeRuleSetBehavior(req.Behavior)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	lines, _ := cleanRuleSetLines(req.RulesText)
	if len(lines) == 0 {
		writeError(w, http.StatusBadRequest, "at least one rule line is required")
		return
	}

	oldName := existing.Name
	existing.Name = name
	existing.Behavior = behavior
	existing.Description = strings.TrimSpace(req.Description)
	existing.RulesText = req.RulesText
	existing.RuleCount = len(lines)

	if err := s.store.UpdateRuleSet(existing); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if oldName != name {
		s.rulesets.RemoveFile(oldName)
	}
	_ = s.rulesets.Compile(r.Context(), existing)
	_ = s.store.UpdateRuleSet(existing)
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleCompileRuleSet(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid rule set id")
		return
	}
	existing, err := s.store.GetRuleSet(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "rule set not found")
		return
	}
	if compileErr := s.rulesets.Compile(r.Context(), existing); compileErr != nil {
		_ = s.store.UpdateRuleSet(existing)
		writeError(w, http.StatusBadGateway, compileErr.Error())
		return
	}
	_ = s.store.UpdateRuleSet(existing)
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteRuleSet(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid rule set id")
		return
	}
	existing, err := s.store.GetRuleSet(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "rule set not found")
		return
	}
	if err := s.store.DeleteRuleSet(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.rulesets.RemoveFile(existing.Name)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleServePublicRuleSetMRS(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimSpace(chi.URLParam(r, "filename"))
	name := strings.TrimSuffix(filename, ".mrs")
	if !isValidRuleSetName(name) || !strings.HasSuffix(filename, ".mrs") {
		writeError(w, http.StatusNotFound, "rule set not found")
		return
	}
	mrsFile := s.rulesets.mrsPath(name)
	info, err := os.Stat(mrsFile)
	if err != nil || info.IsDir() {
		writeError(w, http.StatusNotFound, "compiled .mrs not found")
		return
	}
	f, err := os.Open(mrsFile)
	if err != nil {
		writeError(w, http.StatusNotFound, "compiled .mrs not found")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name+".mrs"))
	w.Header().Set("Cache-Control", "public, max-age=300")
	http.ServeContent(w, r, name+".mrs", info.ModTime(), f)
}
