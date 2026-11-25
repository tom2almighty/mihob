package hub

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mihob/mihob/internal/mihomogen"
	"github.com/mihob/mihob/internal/model"
)

const (
	endpointCacheFreshTTL   = 5 * time.Minute
	endpointCacheStaleTTL   = 24 * time.Hour
	maxEndpointFetchBytes   = 512 * 1024
	maxEndpointsPerSource   = 50
	maxEndpointsPerInbound  = 100
	defaultEndpointAPICount = 5
)

type cachedEndpointList struct {
	raw       string
	fetchedAt time.Time
}

// EndpointResolver fetches, caches, and parses dynamic optimal-IP APIs (e.g. Cloudflare optimal IPs).
type EndpointResolver struct {
	mu     sync.RWMutex
	cache  map[string]cachedEndpointList
	client *http.Client
}

func NewEndpointResolver() *EndpointResolver {
	return &EndpointResolver{
		cache:  make(map[string]cachedEndpointList),
		client: newSafeThemeHTTPClient(),
	}
}

func inboundSupportsClientEndpoints(in *model.Inbound) bool {
	if in == nil {
		return false
	}
	switch in.Protocol {
	case model.ProtoVLESS, model.ProtoVMess, model.ProtoTrojan:
		return in.Settings.ClientTLS || in.Settings.Security == "tls"
	default:
		return false
	}
}

func inboundHasDynamicOrMultiEndpoints(in *model.Inbound) bool {
	if !inboundSupportsClientEndpoints(in) {
		return false
	}
	for _, src := range in.Settings.ClientEndpointAPIs {
		if src.Enabled && strings.TrimSpace(src.URL) != "" {
			return true
		}
	}
	rawManual := strings.TrimSpace(in.Settings.ClientServer)
	if rawManual == "" {
		return false
	}
	return strings.ContainsAny(rawManual, "\n,#:")
}

// ResolveForInbounds resolves dynamic endpoint APIs and multi-line manual endpoints concurrently.
func (r *EndpointResolver) ResolveForInbounds(ctx context.Context, nodes []mihomogen.NodeWithInbounds) map[int64][]model.ResolvedEndpoint {
	if r == nil {
		return nil
	}
	var targets []*model.Inbound
	for i := range nodes {
		for j := range nodes[i].Inbounds {
			in := &nodes[i].Inbounds[j]
			if inboundHasDynamicOrMultiEndpoints(in) {
				targets = append(targets, in)
			}
		}
	}
	if len(targets) == 0 {
		return nil
	}

	out := make(map[int64][]model.ResolvedEndpoint, len(targets))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, in := range targets {
		wg.Add(1)
		go func(inbound *model.Inbound) {
			defer wg.Done()
			eps := r.ResolveForInbound(ctx, inbound)
			if len(eps) > 0 {
				mu.Lock()
				out[inbound.ID] = eps
				mu.Unlock()
			}
		}(in)
	}
	wg.Wait()
	return out
}

// ResolveForInbound resolves manual multi-endpoints and all enabled endpoint APIs configured on an inbound.
func (r *EndpointResolver) ResolveForInbound(ctx context.Context, in *model.Inbound) []model.ResolvedEndpoint {
	if r == nil || !inboundSupportsClientEndpoints(in) {
		return nil
	}

	manualPort := resolveFallbackPort(0, in.Settings.ClientPort, in.Port)
	var manualEps []model.ResolvedEndpoint
	if rawManual := strings.TrimSpace(in.Settings.ClientServer); rawManual != "" {
		manualEps = ParseClientEndpointLines(rawManual, manualPort)
	}

	enabled := make([]model.ClientEndpointSource, 0, len(in.Settings.ClientEndpointAPIs))
	for _, src := range in.Settings.ClientEndpointAPIs {
		if src.Enabled && strings.TrimSpace(src.URL) != "" {
			enabled = append(enabled, src)
		}
	}

	// Single plain static host with no APIs and no label/port override: let standard single-proxy path handle it
	if len(enabled) == 0 && len(manualEps) <= 1 && !strings.ContainsAny(strings.TrimSpace(in.Settings.ClientServer), "\n,#:") {
		return nil
	}

	results := make([][]model.ResolvedEndpoint, len(enabled))
	var wg sync.WaitGroup
	for i, src := range enabled {
		wg.Add(1)
		go func(idx int, s model.ClientEndpointSource) {
			defer wg.Done()
			defaultPort := resolveFallbackPort(s.Port, in.Settings.ClientPort, in.Port)
			raw, err := r.fetchRaw(ctx, s.URL, true)
			if err != nil || strings.TrimSpace(raw) == "" {
				return
			}
			parsed := ParseClientEndpointLines(raw, defaultPort)
			filtered, err := FilterResolvedEndpoints(parsed, s.MatchMode, s.IncludeFilter, s.ExcludeFilter)
			if err != nil {
				return
			}
			limit := s.Count
			if limit <= 0 || limit > maxEndpointsPerSource {
				limit = maxEndpointsPerSource
			}
			if len(filtered) > limit {
				filtered = filtered[:limit]
			}
			prefix := strings.TrimSpace(s.Name)
			if prefix != "" {
				for k := range filtered {
					if filtered[k].Label != "" {
						filtered[k].Label = prefix + "-" + filtered[k].Label
					} else {
						filtered[k].Label = prefix
					}
				}
			}
			results[idx] = filtered
		}(i, src)
	}
	wg.Wait()

	// Merge manual endpoints first, then API sources in order, deduplicating (host, port)
	merged := make([]model.ResolvedEndpoint, 0)
	seen := make(map[string]struct{})
	appendUnique := func(list []model.ResolvedEndpoint) bool {
		for _, ep := range list {
			key := strings.ToLower(ep.Host) + ":" + strconv.Itoa(ep.Port)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			merged = append(merged, ep)
			if len(merged) >= maxEndpointsPerInbound {
				return false
			}
		}
		return true
	}

	if !appendUnique(manualEps) {
		return merged
	}
	for _, list := range results {
		if !appendUnique(list) {
			return merged
		}
	}
	return merged
}

func resolveFallbackPort(apiPort, clientPort, inboundPort int) int {
	if apiPort > 0 && apiPort <= 65535 {
		return apiPort
	}
	if clientPort > 0 && clientPort <= 65535 {
		return clientPort
	}
	if inboundPort > 0 && inboundPort <= 65535 {
		return inboundPort
	}
	return 443
}

func (r *EndpointResolver) fetchRaw(ctx context.Context, rawURL string, allowCache bool) (string, error) {
	u, err := validateThemeFetchURL(rawURL)
	if err != nil {
		return "", err
	}
	key := u.String()
	now := time.Now()

	var stale *cachedEndpointList
	if allowCache {
		r.mu.RLock()
		if item, ok := r.cache[key]; ok {
			if now.Sub(item.fetchedAt) < endpointCacheFreshTTL {
				r.mu.RUnlock()
				return item.raw, nil
			}
			if now.Sub(item.fetchedAt) < endpointCacheStaleTTL {
				cp := item
				stale = &cp
			}
		}
		r.mu.RUnlock()
	}

	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, key, nil)
	if err != nil {
		if stale != nil {
			return stale.raw, nil
		}
		return "", err
	}
	req.Header.Set("Accept", "text/plain, */*;q=0.8")
	req.Header.Set("User-Agent", "mihob-endpoint-fetcher/1.0")

	resp, err := r.client.Do(req)
	if err != nil {
		if stale != nil {
			return stale.raw, nil
		}
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if stale != nil {
			return stale.raw, nil
		}
		return "", fmt.Errorf("remote server returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxEndpointFetchBytes+1))
	if err != nil {
		if stale != nil {
			return stale.raw, nil
		}
		return "", err
	}
	if len(body) > maxEndpointFetchBytes {
		return "", fmt.Errorf("response exceeds %d KB limit", maxEndpointFetchBytes/1024)
	}
	text := string(body)

	r.mu.Lock()
	r.cache[key] = cachedEndpointList{raw: text, fetchedAt: now}
	r.mu.Unlock()

	return text, nil
}

// ParseClientEndpointLines parses newline-delimited host:port[#label] (or CSV/space-delimited) endpoint lists.
func ParseClientEndpointLines(raw string, defaultPort int) []model.ResolvedEndpoint {
	if defaultPort <= 0 || defaultPort > 65535 {
		defaultPort = 443
	}
	out := make([]model.ResolvedEndpoint, 0)
	seen := make(map[string]struct{})

	for line := range strings.SplitSeq(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") || strings.HasPrefix(line, "<") {
			continue
		}

		// Check comma-separated multi-endpoints first (e.g. "104.16.1.1, 104.16.1.2:2053#JP, cf.example.com")
		if strings.Contains(line, ",") {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 {
				stripHash := func(s string) string {
					if idx := strings.IndexByte(s, '#'); idx >= 0 {
						s = s[:idx]
					}
					return strings.TrimSpace(s)
				}
				_, _, firstIsHost := splitEndpointHostPort(stripHash(parts[0]))
				_, _, secondIsHost := splitEndpointHostPort(stripHash(parts[1]))
				if firstIsHost && secondIsHost {
					for _, rawPart := range parts {
						pTrim := strings.TrimSpace(rawPart)
						if pTrim == "" {
							continue
						}
						subLabel := ""
						if hIdx := strings.IndexByte(pTrim, '#'); hIdx >= 0 {
							subLabel = strings.TrimSpace(pTrim[hIdx+1:])
							pTrim = strings.TrimSpace(pTrim[:hIdx])
						}
						h, p, ok := splitEndpointHostPort(pTrim)
						if !ok {
							continue
						}
						if p == 0 {
							p = defaultPort
						}
						k := strings.ToLower(h) + ":" + strconv.Itoa(p)
						if _, dup := seen[k]; dup {
							continue
						}
						seen[k] = struct{}{}
						out = append(out, model.ResolvedEndpoint{
							Host:  h,
							Port:  p,
							Label: sanitizeEndpointLabel(subLabel),
						})
					}
					continue
				}
			}
		}

		// Split optional #label (most common format: 104.16.1.1:443#香港移动)
		addrPart := line
		label := ""
		if hashIdx := strings.IndexByte(line, '#'); hashIdx >= 0 {
			addrPart = strings.TrimSpace(line[:hashIdx])
			label = strings.TrimSpace(line[hashIdx+1:])
		}
		if addrPart == "" {
			continue
		}

		// Also support CSV ("ip,port,label" or "ip:port,label") and space-separated ("ip port label")
		var host string
		var port int
		if strings.Contains(addrPart, ",") {
			parts := strings.Split(addrPart, ",")
			first := strings.TrimSpace(parts[0])
			h, p, ok := splitEndpointHostPort(first)
			if !ok {
				continue
			}
			host, port = h, p
			if port == 0 && len(parts) >= 2 {
				if parsedPort, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil && parsedPort >= 1 && parsedPort <= 65535 {
					port = parsedPort
					if label == "" && len(parts) >= 3 {
						label = strings.TrimSpace(parts[2])
					}
				} else if label == "" {
					label = strings.TrimSpace(parts[1])
				}
			} else if label == "" && len(parts) >= 2 {
				label = strings.TrimSpace(parts[1])
			}
		} else if fields := strings.Fields(addrPart); len(fields) > 1 {
			h, p, ok := splitEndpointHostPort(fields[0])
			if !ok {
				continue
			}
			host, port = h, p
			if port == 0 {
				if parsedPort, err := strconv.Atoi(fields[1]); err == nil && parsedPort >= 1 && parsedPort <= 65535 {
					port = parsedPort
					if label == "" && len(fields) >= 3 {
						label = strings.Join(fields[2:], " ")
					}
				} else if label == "" {
					label = strings.Join(fields[1:], " ")
				}
			} else if label == "" {
				label = strings.Join(fields[1:], " ")
			}
		} else {
			h, p, ok := splitEndpointHostPort(addrPart)
			if !ok {
				continue
			}
			host, port = h, p
		}

		if port == 0 {
			port = defaultPort
		}
		key := strings.ToLower(host) + ":" + strconv.Itoa(port)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, model.ResolvedEndpoint{
			Host:  host,
			Port:  port,
			Label: sanitizeEndpointLabel(label),
		})
	}
	return out
}

func splitEndpointHostPort(token string) (string, int, bool) {
	token = strings.TrimSpace(token)
	if token == "" || strings.Contains(token, "://") || strings.ContainsAny(token, "/?@") {
		return "", 0, false
	}

	// Bracketed IPv6: [2606:4700::1]:443 or [2606:4700::1]
	if strings.HasPrefix(token, "[") {
		if h, pStr, err := net.SplitHostPort(token); err == nil {
			p, err := strconv.Atoi(pStr)
			if err != nil || p < 1 || p > 65535 || !isValidEndpointHost(h) {
				return "", 0, false
			}
			return h, p, true
		}
		if strings.HasSuffix(token, "]") {
			inner := token[1 : len(token)-1]
			if net.ParseIP(inner) != nil {
				return inner, 0, true
			}
		}
		return "", 0, false
	}

	// Bare IPv6 address (contains multiple colons)
	if strings.Count(token, ":") > 1 {
		if net.ParseIP(token) != nil {
			return token, 0, true
		}
		return "", 0, false
	}

	// IPv4 or hostname with optional :port
	if strings.Contains(token, ":") {
		h, pStr, err := net.SplitHostPort(token)
		if err != nil {
			return "", 0, false
		}
		p, err := strconv.Atoi(pStr)
		if err != nil || p < 1 || p > 65535 || !isValidEndpointHost(h) {
			return "", 0, false
		}
		return h, p, true
	}

	if isValidEndpointHost(token) {
		return token, 0, true
	}
	return "", 0, false
}

func isValidEndpointHost(host string) bool {
	host = strings.TrimSpace(host)
	if host == "" || len(host) > 253 {
		return false
	}
	if net.ParseIP(host) != nil {
		return true
	}
	// Require at least one dot for hostnames so CSV headers like "IP" are skipped
	if !strings.Contains(host, ".") || strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") {
		return false
	}
	for _, r := range host {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '-' {
			continue
		}
		return false
	}
	return true
}

func sanitizeEndpointLabel(label string) string {
	label = strings.TrimSpace(label)
	if len(label) > 64 {
		runes := []rune(label)
		if len(runes) > 32 {
			label = string(runes[:32])
		}
	}
	return label
}

func splitFilterKeywords(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '，' || r == '|' || r == '\n' || r == ';' || r == '；'
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.ToLower(strings.TrimSpace(p)); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// FilterResolvedEndpoints filters parsed endpoints by keyword list or RE2 regex against "host:port#label".
func FilterResolvedEndpoints(endpoints []model.ResolvedEndpoint, matchMode, includeRaw, excludeRaw string) ([]model.ResolvedEndpoint, error) {
	inc := strings.TrimSpace(includeRaw)
	exc := strings.TrimSpace(excludeRaw)
	if inc == "" && exc == "" {
		return endpoints, nil
	}

	mode := strings.ToLower(strings.TrimSpace(matchMode))
	if mode == "regex" {
		var incRe, excRe *regexp.Regexp
		var err error
		if inc != "" {
			incRe, err = regexp.Compile(inc)
			if err != nil {
				return nil, fmt.Errorf("invalid include regex: %w", err)
			}
		}
		if exc != "" {
			excRe, err = regexp.Compile(exc)
			if err != nil {
				return nil, fmt.Errorf("invalid exclude regex: %w", err)
			}
		}
		out := make([]model.ResolvedEndpoint, 0, len(endpoints))
		for _, ep := range endpoints {
			candidate := formatEndpointMatchTarget(ep)
			if incRe != nil && !incRe.MatchString(candidate) {
				continue
			}
			if excRe != nil && excRe.MatchString(candidate) {
				continue
			}
			out = append(out, ep)
		}
		return out, nil
	}

	incKeys := splitFilterKeywords(inc)
	excKeys := splitFilterKeywords(exc)
	if len(incKeys) == 0 && len(excKeys) == 0 {
		return endpoints, nil
	}

	out := make([]model.ResolvedEndpoint, 0, len(endpoints))
	for _, ep := range endpoints {
		candidate := strings.ToLower(formatEndpointMatchTarget(ep))
		if len(incKeys) > 0 {
			matched := false
			for _, kw := range incKeys {
				if strings.Contains(candidate, kw) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		excluded := false
		for _, kw := range excKeys {
			if strings.Contains(candidate, kw) {
				excluded = true
				break
			}
		}
		if excluded {
			continue
		}
		out = append(out, ep)
	}
	return out, nil
}

func formatEndpointMatchTarget(ep model.ResolvedEndpoint) string {
	host := ep.Host
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if ep.Label != "" {
		return fmt.Sprintf("%s:%d#%s", host, ep.Port, ep.Label)
	}
	return fmt.Sprintf("%s:%d", host, ep.Port)
}

func (s *Server) handleTestClientEndpointAPI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL           string `json:"url"`
		Name          string `json:"name"`
		Count         int    `json:"count"`
		Port          int    `json:"port"`
		MatchMode     string `json:"match_mode"`
		IncludeFilter string `json:"include_filter"`
		ExcludeFilter string `json:"exclude_filter"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.URL) == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	raw, err := s.endpoints.fetchRaw(r.Context(), req.URL, false)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	defaultPort := resolveFallbackPort(req.Port, 443, 443)
	all := ParseClientEndpointLines(raw, defaultPort)
	matched, err := FilterResolvedEndpoints(all, req.MatchMode, req.IncludeFilter, req.ExcludeFilter)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	applied := matched
	limit := req.Count
	if limit <= 0 {
		limit = defaultEndpointAPICount
	}
	if limit > maxEndpointsPerSource {
		limit = maxEndpointsPerSource
	}
	if len(applied) > limit {
		applied = applied[:limit]
	}
	prefix := strings.TrimSpace(req.Name)
	if prefix != "" {
		out := make([]model.ResolvedEndpoint, len(applied))
		for i, ep := range applied {
			if ep.Label != "" {
				ep.Label = prefix + "-" + ep.Label
			} else {
				ep.Label = prefix
			}
			out[i] = ep
		}
		applied = out
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"total":     len(all),
		"matched":   len(matched),
		"applied":   len(applied),
		"endpoints": applied,
	})
}
