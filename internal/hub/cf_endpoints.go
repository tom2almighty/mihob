package hub

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
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
	if in == nil || len(in.Settings.ClientEndpointAPIs) == 0 {
		return false
	}
	switch in.Protocol {
	case model.ProtoVLESS, model.ProtoVMess, model.ProtoTrojan:
		return in.Settings.ClientTLS || in.Settings.Security == "tls"
	default:
		return false
	}
}

// ResolveForInbounds resolves dynamic endpoint APIs concurrently for all qualifying inbounds.
func (r *EndpointResolver) ResolveForInbounds(ctx context.Context, nodes []mihomogen.NodeWithInbounds) map[int64][]model.ResolvedEndpoint {
	if r == nil {
		return nil
	}
	var targets []*model.Inbound
	for i := range nodes {
		for j := range nodes[i].Inbounds {
			in := &nodes[i].Inbounds[j]
			if inboundSupportsClientEndpoints(in) {
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

// ResolveForInbound resolves all enabled endpoint APIs configured on a single inbound.
func (r *EndpointResolver) ResolveForInbound(ctx context.Context, in *model.Inbound) []model.ResolvedEndpoint {
	if r == nil || !inboundSupportsClientEndpoints(in) {
		return nil
	}
	enabled := make([]model.ClientEndpointSource, 0, len(in.Settings.ClientEndpointAPIs))
	for _, src := range in.Settings.ClientEndpointAPIs {
		if src.Enabled && strings.TrimSpace(src.URL) != "" {
			enabled = append(enabled, src)
		}
	}
	if len(enabled) == 0 {
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
			limit := s.Count
			if limit <= 0 || limit > maxEndpointsPerSource {
				limit = maxEndpointsPerSource
			}
			if len(parsed) > limit {
				parsed = parsed[:limit]
			}
			prefix := strings.TrimSpace(s.Name)
			if prefix != "" {
				for k := range parsed {
					if parsed[k].Label != "" {
						parsed[k].Label = prefix + "-" + parsed[k].Label
					} else {
						parsed[k].Label = prefix
					}
				}
			}
			results[idx] = parsed
		}(i, src)
	}
	wg.Wait()

	// Merge preserving source order and deduplicating (host, port)
	merged := make([]model.ResolvedEndpoint, 0)
	seen := make(map[string]struct{})
	for _, list := range results {
		for _, ep := range list {
			key := strings.ToLower(ep.Host) + ":" + strconv.Itoa(ep.Port)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			merged = append(merged, ep)
			if len(merged) >= maxEndpointsPerInbound {
				return merged
			}
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

		// Split optional #label first (most common format: 104.16.1.1:443#香港移动)
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

func (s *Server) handleTestClientEndpointAPI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL   string `json:"url"`
		Name  string `json:"name"`
		Count int    `json:"count"`
		Port  int    `json:"port"`
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
	applied := all
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
		"applied":   len(applied),
		"endpoints": applied,
	})
}
