package hub

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

const (
	mihomoGitHubAPIBase     = "https://api.github.com/repos/MetaCubeX/mihomo/releases"
	mihomoReleaseCacheTTL   = 15 * time.Minute
	maxMihomoArchiveBytes   = 100 * 1024 * 1024 // 100 MB compressed
	maxMihomoBinaryBytes    = 200 * 1024 * 1024 // 200 MB decompressed
	maxCachedMihomoBinaries = 10
)

var (
	mihomoVersionPattern = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9._-]+)?$`)
	semverTriplePattern  = regexp.MustCompile(`v?(\d+)\.(\d+)\.(\d+)`)
	allowedMihomoHosts   = map[string]bool{
		"github.com":                           true,
		"objects.githubusercontent.com":        true,
		"release-assets.githubusercontent.com": true,
	}
)

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type githubRelease struct {
	TagName     string               `json:"tag_name"`
	HTMLURL     string               `json:"html_url"`
	PublishedAt string               `json:"published_at"`
	Assets      []githubReleaseAsset `json:"assets"`
}

type CachedMihomoBinary struct {
	Version string
	Arch    string
	GzPath  string
	SHA256  string // hex SHA-256 of the decompressed binary
}

type MihomoReleaseManager struct {
	store      *db.Store
	cacheDir   string
	apiBaseURL string
	httpClient *http.Client

	metaMu     sync.RWMutex
	latestInfo *model.MihomoReleaseInfo
	latestRaw  *githubRelease
	checkedAt  time.Time

	dlMu    sync.Mutex
	dlLocks map[string]*sync.Mutex
}

func NewMihomoReleaseManager(store *db.Store, dataDir string) *MihomoReleaseManager {
	return &MihomoReleaseManager{
		store:      store,
		cacheDir:   filepath.Join(dataDir, "mihomo-cache"),
		apiBaseURL: mihomoGitHubAPIBase,
		httpClient: &http.Client{
			Timeout: 90 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return errors.New("too many redirects")
				}
				if !isAllowedMihomoDownloadURL(req.URL) {
					return fmt.Errorf("redirect to untrusted host %q blocked", req.URL.Hostname())
				}
				return nil
			},
		},
		dlLocks: make(map[string]*sync.Mutex),
	}
}

func isValidMihomoVersion(v string) bool {
	return mihomoVersionPattern.MatchString(strings.TrimSpace(v))
}

func compareSemver(a, b string) int {
	ma := semverTriplePattern.FindStringSubmatch(a)
	mb := semverTriplePattern.FindStringSubmatch(b)
	if len(ma) != 4 || len(mb) != 4 {
		return 0
	}
	for i := 1; i <= 3; i++ {
		va, errA := strconv.Atoi(ma[i])
		vb, errB := strconv.Atoi(mb[i])
		if errA != nil || errB != nil {
			return 0
		}
		if va > vb {
			return 1
		}
		if va < vb {
			return -1
		}
	}
	return 0
}

func isValidMihomoArch(arch string) bool {
	return arch == "amd64" || arch == "arm64"
}

func isAllowedMihomoDownloadURL(u *url.URL) bool {
	if u == nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	// Allow loopback only when tests override apiBaseURL to httptest.Server
	if host == "127.0.0.1" || host == "localhost" {
		return true
	}
	if u.Scheme != "https" {
		return false
	}
	return allowedMihomoHosts[host]
}

func (m *MihomoReleaseManager) githubToken() string {
	if m.store == nil {
		return ""
	}
	if st, err := m.store.GetSystemSettings(); err == nil {
		return strings.TrimSpace(st.GitHubToken)
	}
	return ""
}

func (m *MihomoReleaseManager) fetchRelease(ctx context.Context, endpoint string) (*githubRelease, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "mihob-hub")
	if tok := m.githubToken(); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request github release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		if resp.Header.Get("X-RateLimit-Remaining") == "0" {
			return nil, errors.New("GitHub API rate limit exceeded; configure a GitHub Token in Settings")
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github api returned HTTP %d", resp.StatusCode)
	}

	var rel githubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2*1024*1024)).Decode(&rel); err != nil {
		return nil, fmt.Errorf("decode github release: %w", err)
	}
	if !isValidMihomoVersion(rel.TagName) {
		return nil, fmt.Errorf("unexpected release tag %q", rel.TagName)
	}
	return &rel, nil
}

func releaseSupportedArches(rel *githubRelease) []string {
	arches := make([]string, 0, 2)
	for _, arch := range []string{"amd64", "arm64"} {
		expected := fmt.Sprintf("mihomo-linux-%s-%s.gz", arch, rel.TagName)
		for _, a := range rel.Assets {
			if a.Name == expected {
				arches = append(arches, arch)
				break
			}
		}
	}
	return arches
}

func (m *MihomoReleaseManager) GetLatestRelease(ctx context.Context, forceRefresh bool) (*model.MihomoReleaseInfo, error) {
	if !forceRefresh {
		m.metaMu.RLock()
		if m.latestInfo != nil && time.Since(m.checkedAt) < mihomoReleaseCacheTTL {
			cp := *m.latestInfo
			cp.Cached = true
			m.metaMu.RUnlock()
			return &cp, nil
		}
		m.metaMu.RUnlock()
	}

	rel, err := m.fetchRelease(ctx, strings.TrimRight(m.apiBaseURL, "/")+"/latest")
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	info := &model.MihomoReleaseInfo{
		Version:     rel.TagName,
		PublishedAt: rel.PublishedAt,
		ReleaseURL:  rel.HTMLURL,
		Assets:      releaseSupportedArches(rel),
		CheckedAt:   now,
		Cached:      false,
	}

	m.metaMu.Lock()
	m.latestInfo = info
	m.latestRaw = rel
	m.checkedAt = now
	m.metaMu.Unlock()

	cp := *info
	return &cp, nil
}

func (m *MihomoReleaseManager) lockForKey(key string) *sync.Mutex {
	m.dlMu.Lock()
	defer m.dlMu.Unlock()
	mu, ok := m.dlLocks[key]
	if !ok {
		mu = &sync.Mutex{}
		m.dlLocks[key] = mu
	}
	return mu
}

func (m *MihomoReleaseManager) cachePaths(version, arch string) (gzPath, shaPath string) {
	base := fmt.Sprintf("mihomo-%s-linux-%s", version, arch)
	return filepath.Join(m.cacheDir, base+".gz"), filepath.Join(m.cacheDir, base+".sha256")
}

func (m *MihomoReleaseManager) EnsureBinaryCached(ctx context.Context, version, arch string) (*CachedMihomoBinary, error) {
	version = strings.TrimSpace(version)
	arch = strings.TrimSpace(arch)
	if !isValidMihomoVersion(version) {
		return nil, fmt.Errorf("invalid mihomo version %q", version)
	}
	if !isValidMihomoArch(arch) {
		return nil, fmt.Errorf("unsupported architecture %q (only amd64 and arm64 are supported)", arch)
	}

	key := version + ":" + arch
	mu := m.lockForKey(key)
	mu.Lock()
	defer mu.Unlock()

	gzPath, shaPath := m.cachePaths(version, arch)
	if _, err := os.Stat(gzPath); err == nil {
		if shaBytes, sErr := os.ReadFile(shaPath); sErr == nil {
			sum := strings.TrimSpace(string(shaBytes))
			if len(sum) == 64 {
				return &CachedMihomoBinary{
					Version: version,
					Arch:    arch,
					GzPath:  gzPath,
					SHA256:  sum,
				}, nil
			}
		}
	}

	// Find exact official asset URL from GitHub Release API
	var rel *githubRelease
	m.metaMu.RLock()
	if m.latestRaw != nil && m.latestRaw.TagName == version {
		rel = m.latestRaw
	}
	m.metaMu.RUnlock()

	if rel == nil {
		var err error
		rel, err = m.fetchRelease(ctx, fmt.Sprintf("%s/tags/%s", strings.TrimRight(m.apiBaseURL, "/"), url.PathEscape(version)))
		if err != nil {
			return nil, err
		}
	}

	expectedAsset := fmt.Sprintf("mihomo-linux-%s-%s.gz", arch, version)
	var downloadURL string
	for _, a := range rel.Assets {
		if a.Name == expectedAsset {
			downloadURL = a.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" {
		return nil, fmt.Errorf("asset %s not found in release %s", expectedAsset, version)
	}
	parsedURL, err := url.Parse(downloadURL)
	if err != nil || !isAllowedMihomoDownloadURL(parsedURL) {
		return nil, fmt.Errorf("untrusted asset download URL %q", downloadURL)
	}

	if err := os.MkdirAll(m.cacheDir, 0o755); err != nil {
		return nil, fmt.Errorf("create mihomo cache dir: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "mihob-hub")
	if tok := m.githubToken(); tok != "" && strings.EqualFold(parsedURL.Hostname(), "github.com") {
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download mihomo archive: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download mihomo archive returned HTTP %d", resp.StatusCode)
	}

	tmpPath := gzPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return nil, err
	}
	n, copyErr := io.Copy(f, io.LimitReader(resp.Body, maxMihomoArchiveBytes+1))
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("save mihomo archive: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return nil, closeErr
	}
	if n > maxMihomoArchiveBytes {
		_ = os.Remove(tmpPath)
		return nil, errors.New("downloaded mihomo archive exceeds size limit")
	}

	// Verify gzip integrity & compute SHA-256 of the decompressed executable binary
	sum, err := hashDecompressedGzip(tmpPath, maxMihomoBinaryBytes)
	if err != nil {
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("verify downloaded mihomo archive: %w", err)
	}

	if err := os.Rename(tmpPath, gzPath); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}
	if err := os.WriteFile(shaPath, []byte(sum+"\n"), 0o644); err != nil {
		return nil, err
	}

	m.pruneOldCache()

	return &CachedMihomoBinary{
		Version: version,
		Arch:    arch,
		GzPath:  gzPath,
		SHA256:  sum,
	}, nil
}

func hashDecompressedGzip(gzPath string, maxBytes int64) (string, error) {
	f, err := os.Open(gzPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	gr, err := gzip.NewReader(f)
	if err != nil {
		return "", err
	}
	defer gr.Close()

	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(gr, maxBytes+1))
	if err != nil {
		return "", err
	}
	if n == 0 {
		return "", errors.New("decompressed binary is empty")
	}
	if n > maxBytes {
		return "", errors.New("decompressed binary exceeds size limit")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (m *MihomoReleaseManager) pruneOldCache() {
	entries, err := os.ReadDir(m.cacheDir)
	if err != nil {
		return
	}
	type item struct {
		name    string
		modTime time.Time
	}
	var gzFiles []item
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".gz") {
			if info, err := e.Info(); err == nil {
				gzFiles = append(gzFiles, item{name: e.Name(), modTime: info.ModTime()})
			}
		}
	}
	if len(gzFiles) <= maxCachedMihomoBinaries {
		return
	}
	sort.Slice(gzFiles, func(i, j int) bool {
		return gzFiles[i].modTime.After(gzFiles[j].modTime)
	})
	for _, old := range gzFiles[maxCachedMihomoBinaries:] {
		base := strings.TrimSuffix(old.name, ".gz")
		_ = os.Remove(filepath.Join(m.cacheDir, old.name))
		_ = os.Remove(filepath.Join(m.cacheDir, base+".sha256"))
	}
}

// --- HTTP Handlers ---

func (s *Server) handleLatestMihomo(w http.ResponseWriter, r *http.Request) {
	refresh := r.URL.Query().Get("refresh") == "1" || r.URL.Query().Get("refresh") == "true"
	info, err := s.mihomo.GetLatestRelease(r.Context(), refresh)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleAgentMihomoBinary(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Node-Token")
	if token == "" {
		writeError(w, http.StatusUnauthorized, "missing node token")
		return
	}
	if _, err := s.store.GetNodeByToken(token); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid node token")
		return
	}

	version := strings.TrimSpace(r.URL.Query().Get("version"))
	arch := strings.TrimSpace(r.URL.Query().Get("arch"))
	cached, err := s.mihomo.EnsureBinaryCached(r.Context(), version, arch)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("X-Mihomo-Version", cached.Version)
	w.Header().Set("X-Mihomo-SHA256", cached.SHA256)
	http.ServeFile(w, r, cached.GzPath)
}

func (s *Server) handleUpgradeNodeMihomo(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	var req struct {
		Version string `json:"version"`
		Force   bool   `json:"force"`
	}
	_ = decodeJSON(r, &req)

	version := strings.TrimSpace(req.Version)
	if version == "" {
		info, err := s.mihomo.GetLatestRelease(r.Context(), false)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		version = info.Version
	}
	if !isValidMihomoVersion(version) {
		writeError(w, http.StatusBadRequest, "invalid target mihomo version")
		return
	}

	rt := s.ws.GetRuntime(id)
	if !rt.Online {
		writeError(w, http.StatusBadRequest, "node is offline")
		return
	}
	if rt.UpgradeStatus == "upgrading" {
		writeError(w, http.StatusConflict, "node upgrade already in progress")
		return
	}
	if !req.Force && rt.MihomoVersion != "" && compareSemver(rt.MihomoVersion, version) >= 0 {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("node is already running %s (>= %s)", rt.MihomoVersion, version))
		return
	}
	if rt.OS != "" && rt.OS != "linux" {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported node OS %q (only linux is supported)", rt.OS))
		return
	}
	arch := rt.Arch
	if !isValidMihomoArch(arch) {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported or unknown node architecture %q (upgrade mihob-agent first)", arch))
		return
	}

	cached, err := s.mihomo.EnsureBinaryCached(r.Context(), version, arch)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	downloadPath := fmt.Sprintf("/api/agent/mihomo-binary?version=%s&arch=%s", url.QueryEscape(cached.Version), url.QueryEscape(cached.Arch))
	if err := s.ws.UpgradeNodeMihomo(id, cached.Version, downloadPath, cached.SHA256); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "upgrading",
		"version": cached.Version,
		"sha256":  cached.SHA256,
	})
}

func (s *Server) handleBatchUpgradeMihomo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		NodeIDs []int64 `json:"node_ids"`
		Version string  `json:"version"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	version := strings.TrimSpace(req.Version)
	if version == "" {
		info, err := s.mihomo.GetLatestRelease(r.Context(), false)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		version = info.Version
	}
	if !isValidMihomoVersion(version) {
		writeError(w, http.StatusBadRequest, "invalid target mihomo version")
		return
	}

	targetIDs := req.NodeIDs
	if len(targetIDs) == 0 {
		nodes, err := s.store.ListNodes()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, n := range nodes {
			targetIDs = append(targetIDs, n.ID)
		}
	}

	type skippedItem struct {
		NodeID int64  `json:"node_id"`
		Reason string `json:"reason"`
	}
	started := []int64{}
	skipped := []skippedItem{}
	cachedByArch := map[string]*CachedMihomoBinary{}

	for _, id := range targetIDs {
		rt := s.ws.GetRuntime(id)
		if !rt.Online {
			skipped = append(skipped, skippedItem{NodeID: id, Reason: "offline"})
			continue
		}
		if rt.UpgradeStatus == "upgrading" {
			skipped = append(skipped, skippedItem{NodeID: id, Reason: "already upgrading"})
			continue
		}
		if rt.MihomoVersion != "" && compareSemver(rt.MihomoVersion, version) >= 0 {
			skipped = append(skipped, skippedItem{NodeID: id, Reason: "already up to date"})
			continue
		}
		if rt.OS != "" && rt.OS != "linux" {
			skipped = append(skipped, skippedItem{NodeID: id, Reason: "unsupported OS: " + rt.OS})
			continue
		}
		if !isValidMihomoArch(rt.Arch) {
			skipped = append(skipped, skippedItem{NodeID: id, Reason: "unsupported arch: " + rt.Arch})
			continue
		}
		cached, ok := cachedByArch[rt.Arch]
		if !ok {
			var err error
			cached, err = s.mihomo.EnsureBinaryCached(r.Context(), version, rt.Arch)
			if err != nil {
				writeError(w, http.StatusBadGateway, err.Error())
				return
			}
			cachedByArch[rt.Arch] = cached
		}

		downloadPath := fmt.Sprintf("/api/agent/mihomo-binary?version=%s&arch=%s", url.QueryEscape(cached.Version), url.QueryEscape(cached.Arch))
		if err := s.ws.UpgradeNodeMihomo(id, cached.Version, downloadPath, cached.SHA256); err != nil {
			skipped = append(skipped, skippedItem{NodeID: id, Reason: err.Error()})
			continue
		}
		started = append(started, id)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"version": version,
		"started": started,
		"skipped": skipped,
	})
}
