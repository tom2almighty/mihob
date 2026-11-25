package hub

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

const (
	maxGeoDataBytes = 100 * 1024 * 1024 // 100 MB per GeoData file
)

var geoDataFilenames = map[string]string{
	"geosite": "geosite.dat",
	"geoip":   "geoip.dat",
	"mmdb":    "country.mmdb",
	"asn":     "GeoLite2-ASN.mmdb",
}

var geoDataKindsOrder = []string{"geosite", "geoip", "mmdb", "asn"}

var builtinGeoSiteTags = []model.GeoTagItem{
	{Tag: "openai"}, {Tag: "anthropic"}, {Tag: "google-gemini"}, {Tag: "category-ai-!cn"}, {Tag: "perplexity"},
	{Tag: "netflix"}, {Tag: "disney"}, {Tag: "youtube"}, {Tag: "tiktok"}, {Tag: "spotify"}, {Tag: "bilibili"}, {Tag: "bahamut"},
	{Tag: "telegram"}, {Tag: "discord"}, {Tag: "twitter"}, {Tag: "instagram"}, {Tag: "facebook"}, {Tag: "whatsapp"},
	{Tag: "github"}, {Tag: "google"}, {Tag: "microsoft"}, {Tag: "apple"}, {Tag: "cloudflare"}, {Tag: "steam"}, {Tag: "geolocation-!cn"},
	{Tag: "cn"}, {Tag: "private"}, {Tag: "category-ads-all"}, {Tag: "category-games@cn"}, {Tag: "apple@cn"}, {Tag: "microsoft@cn"},
}

var builtinGeoIPTags = []model.GeoTagItem{
	{Tag: "LAN"}, {Tag: "PRIVATE"}, {Tag: "CN"}, {Tag: "HK"}, {Tag: "TW"}, {Tag: "JP"}, {Tag: "SG"},
	{Tag: "US"}, {Tag: "GB"}, {Tag: "DE"}, {Tag: "KR"}, {Tag: "FR"}, {Tag: "NL"}, {Tag: "AU"}, {Tag: "CA"},
	{Tag: "TELEGRAM"}, {Tag: "GOOGLE"}, {Tag: "NETFLIX"}, {Tag: "CLOUDFLARE"}, {Tag: "FACEBOOK"}, {Tag: "TWITTER"},
}

type GeoDataManager struct {
	store   *db.Store
	dataDir string
	client  *http.Client

	mu           sync.RWMutex
	geositeTags  []model.GeoTagItem
	geoipTags    []model.GeoTagItem
	geositeMtime time.Time
	geoipMtime   time.Time
	dlMu         sync.Mutex
}

func NewGeoDataManager(store *db.Store, dataDir string) *GeoDataManager {
	safeClient := newSafeThemeHTTPClient()
	safeClient.Timeout = 120 * time.Second
	return &GeoDataManager{
		store:   store,
		dataDir: filepath.Join(dataDir, "geodata"),
		client:  safeClient,
	}
}

func (m *GeoDataManager) filePath(kind string) (string, bool) {
	name, ok := geoDataFilenames[kind]
	if !ok {
		return "", false
	}
	return filepath.Join(m.dataDir, name), true
}

func (m *GeoDataManager) urlForKind(geo model.GeoXURLs, kind string) string {
	def := model.DefaultGeoXURLs()
	switch kind {
	case "geosite":
		if strings.TrimSpace(geo.GeoSite) != "" {
			return strings.TrimSpace(geo.GeoSite)
		}
		return def.GeoSite
	case "geoip":
		if strings.TrimSpace(geo.GeoIP) != "" {
			return strings.TrimSpace(geo.GeoIP)
		}
		return def.GeoIP
	case "mmdb":
		if strings.TrimSpace(geo.MMDB) != "" {
			return strings.TrimSpace(geo.MMDB)
		}
		return def.MMDB
	case "asn":
		if strings.TrimSpace(geo.ASN) != "" {
			return strings.TrimSpace(geo.ASN)
		}
		return def.ASN
	default:
		return ""
	}
}

func (m *GeoDataManager) loadTagsIfNeeded(kind string) ([]model.GeoTagItem, bool) {
	if kind != "geosite" && kind != "geoip" {
		return nil, false
	}
	p, ok := m.filePath(kind)
	if !ok {
		return nil, false
	}
	info, err := os.Stat(p)
	if err != nil || info.IsDir() || info.Size() == 0 {
		return nil, false
	}
	modTime := info.ModTime()

	m.mu.RLock()
	if kind == "geosite" && len(m.geositeTags) > 0 && m.geositeMtime.Equal(modTime) {
		tags := m.geositeTags
		m.mu.RUnlock()
		return tags, true
	}
	if kind == "geoip" && len(m.geoipTags) > 0 && m.geoipMtime.Equal(modTime) {
		tags := m.geoipTags
		m.mu.RUnlock()
		return tags, true
	}
	m.mu.RUnlock()

	raw, err := os.ReadFile(p)
	if err != nil {
		return nil, false
	}
	parsed, err := ParseGeoDatTags(raw, kind == "geosite")
	if err != nil || len(parsed) == 0 {
		return nil, false
	}

	m.mu.Lock()
	if kind == "geosite" {
		m.geositeTags = parsed
		m.geositeMtime = modTime
	} else {
		m.geoipTags = parsed
		m.geoipMtime = modTime
	}
	m.mu.Unlock()
	return parsed, true
}

func (m *GeoDataManager) Status() []model.GeoDataFileStatus {
	st, _ := m.store.GetSystemSettings()
	geo := model.DefaultGeoXURLs()
	if st != nil {
		geo = st.GeoXURLs
	}

	out := make([]model.GeoDataFileStatus, 0, len(geoDataKindsOrder))
	for _, kind := range geoDataKindsOrder {
		p, _ := m.filePath(kind)
		item := model.GeoDataFileStatus{
			Kind: kind,
			URL:  m.urlForKind(geo, kind),
		}
		if info, err := os.Stat(p); err == nil && !info.IsDir() && info.Size() > 0 {
			item.Downloaded = true
			item.SizeBytes = info.Size()
			t := info.ModTime().UTC()
			item.UpdatedAt = &t
			if kind == "geosite" || kind == "geoip" {
				if tags, ok := m.loadTagsIfNeeded(kind); ok {
					item.TagCount = len(tags)
				}
			}
		}
		out = append(out, item)
	}
	return out
}

func (m *GeoDataManager) SearchTags(kind, query string, limit int) (source string, total int, items []model.GeoTagItem) {
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	var all []model.GeoTagItem
	if loaded, ok := m.loadTagsIfNeeded(kind); ok {
		source = "local"
		all = loaded
	} else {
		source = "builtin"
		if kind == "geoip" {
			all = builtinGeoIPTags
		} else {
			all = builtinGeoSiteTags
		}
	}
	total = len(all)

	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		if len(all) > limit {
			return source, total, all[:limit]
		}
		return source, total, all
	}

	prefixHits := make([]model.GeoTagItem, 0, limit)
	subHits := make([]model.GeoTagItem, 0, limit)
	for _, item := range all {
		lower := strings.ToLower(item.Tag)
		if strings.HasPrefix(lower, q) {
			prefixHits = append(prefixHits, item)
		} else if strings.Contains(lower, q) {
			subHits = append(subHits, item)
		}
	}
	combined := append(prefixHits, subHits...)
	if len(combined) > limit {
		combined = combined[:limit]
	}
	return source, total, combined
}

func (m *GeoDataManager) Download(ctx context.Context, kinds []string) ([]model.GeoDataFileStatus, map[string]string, error) {
	m.dlMu.Lock()
	defer m.dlMu.Unlock()

	if err := os.MkdirAll(m.dataDir, 0o755); err != nil {
		return nil, nil, fmt.Errorf("create geodata dir: %w", err)
	}

	st, _ := m.store.GetSystemSettings()
	geo := model.DefaultGeoXURLs()
	var ghToken, ghProxy string
	if st != nil {
		geo = st.GeoXURLs
		ghToken = strings.TrimSpace(st.GitHubToken)
		ghProxy = normalizeGitHubProxy(st.GitHubProxy)
	}

	targets := kinds
	if len(targets) == 0 {
		targets = geoDataKindsOrder
	}

	errs := map[string]string{}
	for _, kind := range targets {
		p, ok := m.filePath(kind)
		if !ok {
			continue
		}
		rawURL := m.urlForKind(geo, kind)
		if rawURL == "" {
			continue
		}
		fetchURL := applyGitHubProxyToURL(rawURL, ghProxy)
		if err := m.downloadFile(ctx, fetchURL, p, ghToken, ghProxy == ""); err != nil {
			errs[kind] = err.Error()
			continue
		}
		// Refresh parsed tag cache immediately
		if kind == "geosite" || kind == "geoip" {
			m.mu.Lock()
			if kind == "geosite" {
				m.geositeTags = nil
				m.geositeMtime = time.Time{}
			} else {
				m.geoipTags = nil
				m.geoipMtime = time.Time{}
			}
			m.mu.Unlock()
			_, _ = m.loadTagsIfNeeded(kind)
		}
	}

	return m.Status(), errs, nil
}

func (m *GeoDataManager) downloadFile(ctx context.Context, targetURL, dstPath, ghToken string, directOnly bool) error {
	parsed, err := validateThemeFetchURL(targetURL)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "mihob-geodata/1.0")
	// Only send GitHub Token directly to GitHub hosts — never leak credentials to third-party proxy domains
	if directOnly && ghToken != "" && isGitHubTokenHost(parsed) {
		req.Header.Set("Authorization", "Bearer "+ghToken)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	tmpPath := dstPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	written, copyErr := io.Copy(f, io.LimitReader(resp.Body, maxGeoDataBytes+1))
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return closeErr
	}
	if written == 0 {
		_ = os.Remove(tmpPath)
		return errors.New("empty response body")
	}
	if written > maxGeoDataBytes {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("file exceeds %d MB limit", maxGeoDataBytes/(1024*1024))
	}
	if err := os.Rename(tmpPath, dstPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

func isGitHubTokenHost(u *url.URL) bool {
	if u == nil {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return h == "github.com" || h == "api.github.com" || h == "raw.githubusercontent.com"
}

// ParseGeoDatTags extracts all tag names and entry counts from a V2Ray/MetaCubeX geosite.dat or geoip.dat
// protobuf wire stream with zero external dependencies.
// Schema:
//   GeoSiteList / GeoIPList: repeated Entry entry = 1;
//   Entry: string country_code = 1; repeated Domain/CIDR items = 2;
func ParseGeoDatTags(data []byte, lowercase bool) ([]model.GeoTagItem, error) {
	if len(data) == 0 {
		return nil, errors.New("empty geodata payload")
	}
	counts := make(map[string]int, 256)
	pos := 0
	for pos < len(data) {
		tagVal, n := binary.Uvarint(data[pos:])
		if n <= 0 {
			return nil, errors.New("invalid protobuf varint in geodata list")
		}
		pos += n
		fieldNum := tagVal >> 3
		wireType := tagVal & 0x7
		if fieldNum == 1 && wireType == 2 {
			msgLen, ln := binary.Uvarint(data[pos:])
			if ln <= 0 || int(msgLen) < 0 || pos+ln+int(msgLen) > len(data) {
				return nil, errors.New("invalid protobuf length in geodata entry")
			}
			pos += ln
			entryBytes := data[pos : pos+int(msgLen)]
			pos += int(msgLen)
			code, cnt, err := parseGeoDatEntry(entryBytes)
			if err != nil {
				return nil, err
			}
			code = strings.TrimSpace(code)
			if code != "" {
				if lowercase {
					code = strings.ToLower(code)
				} else {
					code = strings.ToUpper(code)
				}
				counts[code] += cnt
			}
			continue
		}
		nextPos, err := skipProtobufField(data, pos, wireType)
		if err != nil {
			return nil, err
		}
		pos = nextPos
	}

	out := make([]model.GeoTagItem, 0, len(counts))
	for tag, cnt := range counts {
		out = append(out, model.GeoTagItem{Tag: tag, Count: cnt})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Tag < out[j].Tag
	})
	return out, nil
}

func parseGeoDatEntry(buf []byte) (code string, count int, err error) {
	pos := 0
	for pos < len(buf) {
		tagVal, n := binary.Uvarint(buf[pos:])
		if n <= 0 {
			return "", 0, errors.New("invalid protobuf varint in entry")
		}
		pos += n
		fieldNum := tagVal >> 3
		wireType := tagVal & 0x7
		if fieldNum == 1 && wireType == 2 {
			strLen, ln := binary.Uvarint(buf[pos:])
			if ln <= 0 || pos+ln+int(strLen) > len(buf) {
				return "", 0, errors.New("invalid string length in entry")
			}
			pos += ln
			code = string(buf[pos : pos+int(strLen)])
			pos += int(strLen)
			continue
		}
		if fieldNum == 2 && wireType == 2 {
			itemLen, ln := binary.Uvarint(buf[pos:])
			if ln <= 0 || pos+ln+int(itemLen) > len(buf) {
				return "", 0, errors.New("invalid item length in entry")
			}
			pos += ln + int(itemLen)
			count++
			continue
		}
		nextPos, err := skipProtobufField(buf, pos, wireType)
		if err != nil {
			return "", 0, err
		}
		pos = nextPos
	}
	return code, count, nil
}

func skipProtobufField(buf []byte, pos int, wireType uint64) (int, error) {
	switch wireType {
	case 0: // varint
		_, n := binary.Uvarint(buf[pos:])
		if n <= 0 {
			return 0, errors.New("invalid varint skip")
		}
		return pos + n, nil
	case 1: // 64-bit
		if pos+8 > len(buf) {
			return 0, errors.New("truncated 64-bit field")
		}
		return pos + 8, nil
	case 2: // length-delimited
		l, n := binary.Uvarint(buf[pos:])
		if n <= 0 || pos+n+int(l) > len(buf) {
			return 0, errors.New("truncated bytes field")
		}
		return pos + n + int(l), nil
	case 5: // 32-bit
		if pos+4 > len(buf) {
			return 0, errors.New("truncated 32-bit field")
		}
		return pos + 4, nil
	default:
		return 0, fmt.Errorf("unsupported protobuf wire type %d", wireType)
	}
}

func (s *Server) handleGetGeoDataStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"files": s.geodata.Status(),
	})
}

func (s *Server) handleUpdateGeoData(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Kinds []string `json:"kinds"`
	}
	_ = decodeJSON(r, &req)
	files, errs, err := s.geodata.Download(r.Context(), req.Kinds)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"files":  files,
		"errors": errs,
	})
}

func (s *Server) handleSearchGeoDataTags(w http.ResponseWriter, r *http.Request) {
	kind := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("kind")))
	if kind != "geoip" {
		kind = "geosite"
	}
	q := r.URL.Query().Get("q")
	limit := 80
	if rawLim := strings.TrimSpace(r.URL.Query().Get("limit")); rawLim != "" {
		if n, err := strconv.Atoi(rawLim); err == nil && n > 0 {
			limit = n
		}
	}
	source, total, tags := s.geodata.SearchTags(kind, q, limit)
	writeJSON(w, http.StatusOK, map[string]any{
		"kind":   kind,
		"source": source,
		"total":  total,
		"tags":   tags,
	})
}
