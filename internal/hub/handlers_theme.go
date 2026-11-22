package hub

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/mihob/mihob/internal/model"
)

const (
	maxCustomThemes    = 50
	maxThemeFetchBytes = 512 * 1024
)

var allowedThemeVarKeys = map[string]bool{
	// Colors
	"background":                 true,
	"foreground":                 true,
	"card":                       true,
	"card-foreground":            true,
	"popover":                    true,
	"popover-foreground":         true,
	"primary":                    true,
	"primary-foreground":         true,
	"secondary":                  true,
	"secondary-foreground":       true,
	"muted":                      true,
	"muted-foreground":           true,
	"accent":                     true,
	"accent-foreground":          true,
	"destructive":                true,
	"destructive-foreground":     true,
	"border":                     true,
	"input":                      true,
	"ring":                       true,
	"chart-1":                    true,
	"chart-2":                    true,
	"chart-3":                    true,
	"chart-4":                    true,
	"chart-5":                    true,
	"sidebar":                    true,
	"sidebar-foreground":         true,
	"sidebar-primary":            true,
	"sidebar-primary-foreground": true,
	"sidebar-accent":             true,
	"sidebar-accent-foreground":  true,
	"sidebar-border":             true,
	"sidebar-ring":               true,
	// Mihob optional extensions
	"success":               true,
	"success-foreground":    true,
	"warning":               true,
	"warning-foreground":    true,
	"info":                  true,
	"info-foreground":       true,
	"scrollbar-thumb":       true,
	"scrollbar-thumb-hover": true,
	// Radius, spacing, typography
	"radius":           true,
	"spacing":          true,
	"font-sans":        true,
	"font-serif":       true,
	"font-mono":        true,
	"letter-spacing":   true,
	"tracking-normal":  true,
	"tracking-tighter": true,
	"tracking-tight":   true,
	"tracking-wide":    true,
	"tracking-wider":   true,
	"tracking-widest":  true,
	// Shadows
	"shadow-color":    true,
	"shadow-opacity":  true,
	"shadow-blur":     true,
	"shadow-spread":   true,
	"shadow-offset-x": true,
	"shadow-offset-y": true,
	"shadow-2xs":      true,
	"shadow-xs":       true,
	"shadow-sm":       true,
	"shadow":          true,
	"shadow-md":       true,
	"shadow-lg":       true,
	"shadow-xl":       true,
	"shadow-2xl":      true,
}

var themeIDPattern = regexp.MustCompile(`^[a-zA-Z0-9._-]{1,64}$`)

func isSafeCSSVarValue(v string) bool {
	if v == "" || len(v) > 400 {
		return false
	}
	if strings.ContainsAny(v, "{};<>\\\r\n") {
		return false
	}
	lower := strings.ToLower(v)
	for _, banned := range []string{"url(", "@import", "expression(", "javascript:", "behavior:", "</style"} {
		if strings.Contains(lower, banned) {
			return false
		}
	}
	return true
}

func sanitizeThemeVars(in map[string]string) map[string]string {
	out := make(map[string]string)
	for rawKey, rawVal := range in {
		k := strings.TrimPrefix(strings.TrimSpace(rawKey), "--")
		if !allowedThemeVarKeys[k] {
			continue
		}
		v := strings.TrimSpace(rawVal)
		if !isSafeCSSVarValue(v) {
			continue
		}
		out[k] = v
	}
	return out
}

func sanitizeThemeConfig(in *model.ThemeConfig) (*model.ThemeConfig, error) {
	if in == nil {
		return &model.ThemeConfig{
			ActiveThemeID: "default",
			CustomThemes:  []model.CustomTheme{},
		}, nil
	}
	if len(in.CustomThemes) > maxCustomThemes {
		return nil, fmt.Errorf("too many custom themes (max %d)", maxCustomThemes)
	}

	now := time.Now().UTC()
	seen := make(map[string]bool, len(in.CustomThemes))
	cleanThemes := make([]model.CustomTheme, 0, len(in.CustomThemes))

	for _, t := range in.CustomThemes {
		id := strings.TrimSpace(t.ID)
		if !themeIDPattern.MatchString(id) {
			return nil, fmt.Errorf("invalid theme id %q", id)
		}
		if seen[id] {
			return nil, fmt.Errorf("duplicate theme id %q", id)
		}
		seen[id] = true

		name := strings.TrimSpace(t.Name)
		if name == "" || len(name) > 80 {
			return nil, fmt.Errorf("theme name must be 1-80 characters")
		}

		light := sanitizeThemeVars(t.Light)
		dark := sanitizeThemeVars(t.Dark)
		shared := sanitizeThemeVars(t.Theme)
		if len(light) == 0 && len(dark) == 0 {
			return nil, fmt.Errorf("theme %q has no valid CSS variables", name)
		}

		createdAt := t.CreatedAt
		if createdAt.IsZero() {
			createdAt = now
		}
		updatedAt := t.UpdatedAt
		if updatedAt.IsZero() {
			updatedAt = now
		}

		sourceURL := strings.TrimSpace(t.SourceURL)
		if len(sourceURL) > 512 {
			sourceURL = sourceURL[:512]
		}

		ct := model.CustomTheme{
			ID:        id,
			Name:      name,
			SourceURL: sourceURL,
			Light:     light,
			Dark:      dark,
			CreatedAt: createdAt,
			UpdatedAt: updatedAt,
		}
		if len(shared) > 0 {
			ct.Theme = shared
		}
		cleanThemes = append(cleanThemes, ct)
	}

	activeID := strings.TrimSpace(in.ActiveThemeID)
	if activeID == "" {
		activeID = "default"
	} else if !themeIDPattern.MatchString(activeID) {
		return nil, fmt.Errorf("invalid active_theme_id %q", activeID)
	}

	return &model.ThemeConfig{
		ActiveThemeID: activeID,
		CustomThemes:  cleanThemes,
	}, nil
}

func (s *Server) handlePublicTheme(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.GetThemeConfig()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	resp := model.PublicThemeResponse{
		ActiveThemeID: cfg.ActiveThemeID,
	}
	for i := range cfg.CustomThemes {
		if cfg.CustomThemes[i].ID == cfg.ActiveThemeID {
			ct := cfg.CustomThemes[i]
			resp.ActiveCustomTheme = &ct
			break
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetThemes(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.GetThemeConfig()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleUpdateThemes(w http.ResponseWriter, r *http.Request) {
	var req model.ThemeConfig
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	clean, err := sanitizeThemeConfig(&req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.store.SaveThemeConfig(clean); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, clean)
}

func isDisallowedRemoteIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

func validateThemeFetchURL(rawURL string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, errors.New("invalid URL")
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return nil, errors.New("only http and https URLs are allowed")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
		return nil, errors.New("local or internal hostnames are not allowed")
	}
	if ip := net.ParseIP(host); ip != nil && isDisallowedRemoteIP(ip) {
		return nil, errors.New("private or loopback IP addresses are not allowed")
	}
	return u, nil
}

func newSafeThemeHTTPClient() *http.Client {
	dialer := &net.Dialer{
		Timeout:   8 * time.Second,
		KeepAlive: 15 * time.Second,
	}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			if len(ips) == 0 {
				return nil, errors.New("failed to resolve host")
			}
			for _, ipAddr := range ips {
				if isDisallowedRemoteIP(ipAddr.IP) {
					return nil, errors.New("resolved IP address is not allowed")
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	}
	return &http.Client{
		Timeout:   10 * time.Second,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many redirects")
			}
			if _, err := validateThemeFetchURL(req.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
}

func (s *Server) handleFetchThemeURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	targetURL, err := validateThemeFetchURL(req.URL)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL.String(), nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request URL")
		return
	}
	httpReq.Header.Set("Accept", "application/json, text/css, text/plain;q=0.9, */*;q=0.8")
	httpReq.Header.Set("User-Agent", "mihob-theme-fetcher/1.0")

	client := newSafeThemeHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("failed to fetch theme URL: %v", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("remote server returned HTTP %d", resp.StatusCode))
		return
	}

	limited := io.LimitReader(resp.Body, maxThemeFetchBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to read remote response")
		return
	}
	if len(body) > maxThemeFetchBytes {
		writeError(w, http.StatusBadRequest, "remote theme file exceeds 512 KB limit")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"url":          targetURL.String(),
		"content_type": resp.Header.Get("Content-Type"),
		"content":      string(body),
	})
}
