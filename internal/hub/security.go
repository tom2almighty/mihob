package hub

import (
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	loginWindowDuration      = 60 * time.Second
	loginMaxAttemptsPerWin   = 10
	loginFailureLockoutCount = 5
	loginLockoutDuration     = 60 * time.Second
	maxAPIRequestBodyBytes   = 2 << 20 // 2 MiB
)

var extraDisallowedPrefixes = func() []netip.Prefix {
	cidrs := []string{
		"0.0.0.0/8",       // "This host on this network"
		"100.64.0.0/10",   // CGNAT / Tailscale / Alibaba Cloud metadata (100.100.100.200)
		"192.0.0.0/24",    // IETF Protocol Assignments
		"192.0.2.0/24",    // TEST-NET-1
		"198.18.0.0/15",   // Benchmarking
		"198.51.100.0/24", // TEST-NET-2
		"203.0.113.0/24",  // TEST-NET-3
		"240.0.0.0/4",     // Reserved / Broadcast
		"64:ff9b::/96",    // IPv4/IPv6 NAT64 translation
		"2001:db8::/32",   // Documentation IPv6
	}
	out := make([]netip.Prefix, 0, len(cidrs))
	for _, c := range cidrs {
		if p, err := netip.ParsePrefix(c); err == nil {
			out = append(out, p)
		}
	}
	return out
}()

func isDisallowedRemoteIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return true
	}
	addr = addr.Unmap()
	if !addr.IsValid() ||
		addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified() ||
		addr.IsInterfaceLocalMulticast() {
		return true
	}
	for _, p := range extraDisallowedPrefixes {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// isTrustedProxyIP reports whether a direct TCP peer is a local/private reverse proxy
// (or MIHOB_TRUST_PROXY=true is configured).
func isTrustedProxyIP(remoteAddr string) bool {
	if v := strings.TrimSpace(os.Getenv("MIHOB_TRUST_PROXY")); strings.EqualFold(v, "true") || v == "1" {
		return true
	}
	host := remoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		host = h
	}
	addr, err := netip.ParseAddr(strings.TrimSpace(host))
	if err != nil {
		return false
	}
	addr = addr.Unmap()
	return addr.IsLoopback() || addr.IsPrivate()
}

// trustedRealIPMiddleware replaces unconditional middleware.RealIP so public direct clients
// cannot spoof X-Forwarded-For / X-Real-IP, while reverse-proxied deployments keep working.
func trustedRealIPMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isTrustedProxyIP(r.RemoteAddr) {
			if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
				first := strings.TrimSpace(strings.Split(xff, ",")[0])
				if ip := net.ParseIP(first); ip != nil {
					r.RemoteAddr = first
				}
			} else if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
				if ip := net.ParseIP(xri); ip != nil {
					r.RemoteAddr = xri
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func clientIPKey(r *http.Request) string {
	raw := strings.TrimSpace(r.RemoteAddr)
	if host, _, err := net.SplitHostPort(raw); err == nil && host != "" {
		return host
	}
	if raw == "" {
		return "unknown"
	}
	return raw
}

func securityHeadersMiddleware(next http.Handler) http.Handler {
	const csp = "default-src 'self'; " +
		"script-src 'self' 'unsafe-inline'; " +
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
		"font-src 'self' data: https://fonts.gstatic.com; " +
		"img-src 'self' data: blob:; " +
		"connect-src 'self'; " +
		"frame-ancestors 'none'; " +
		"object-src 'none'; " +
		"base-uri 'self'"

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Content-Security-Policy", csp)
		next.ServeHTTP(w, r)
	})
}

func maxBodyBytesMiddleware(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, limit)
			}
			next.ServeHTTP(w, r)
		})
	}
}

type loginAttemptState struct {
	attempts    []time.Time
	consecutive int
	lockedUntil time.Time
	lastSeen    time.Time
}

type loginRateLimiter struct {
	mu      sync.Mutex
	entries map[string]*loginAttemptState
}

func newLoginRateLimiter() *loginRateLimiter {
	return &loginRateLimiter{
		entries: make(map[string]*loginAttemptState),
	}
}

// Allow checks whether an IP is allowed to attempt login now.
// Returns (allowed, retryAfterSeconds).
func (l *loginRateLimiter) Allow(ip string, now time.Time) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.gcLocked(now)

	st := l.entries[ip]
	if st == nil {
		st = &loginAttemptState{}
		l.entries[ip] = st
	}
	st.lastSeen = now

	if !st.lockedUntil.IsZero() && now.Before(st.lockedUntil) {
		sec := int(st.lockedUntil.Sub(now).Seconds()) + 1
		return false, sec
	}

	cutoff := now.Add(-loginWindowDuration)
	kept := st.attempts[:0]
	for _, ts := range st.attempts {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	st.attempts = kept

	if len(st.attempts) >= loginMaxAttemptsPerWin {
		oldest := st.attempts[0]
		sec := int(oldest.Add(loginWindowDuration).Sub(now).Seconds()) + 1
		if sec < 1 {
			sec = 1
		}
		return false, sec
	}

	st.attempts = append(st.attempts, now)
	return true, 0
}

func (l *loginRateLimiter) RecordFailure(ip string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()

	st := l.entries[ip]
	if st == nil {
		st = &loginAttemptState{}
		l.entries[ip] = st
	}
	st.lastSeen = now
	st.consecutive++
	if st.consecutive >= loginFailureLockoutCount {
		st.lockedUntil = now.Add(loginLockoutDuration)
		st.consecutive = 0
	}
}

func (l *loginRateLimiter) RecordSuccess(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, ip)
}

func (l *loginRateLimiter) gcLocked(now time.Time) {
	if len(l.entries) < 256 {
		return
	}
	staleCutoff := now.Add(-10 * time.Minute)
	for k, v := range l.entries {
		if v.lastSeen.Before(staleCutoff) && now.After(v.lockedUntil) {
			delete(l.entries, k)
		}
	}
}

func writeRateLimited(w http.ResponseWriter, retryAfterSec int) {
	if retryAfterSec < 1 {
		retryAfterSec = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(retryAfterSec))
	writeError(w, http.StatusTooManyRequests, "登录尝试过于频繁，请稍后再试")
}
