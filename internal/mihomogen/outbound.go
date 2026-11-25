package mihomogen

import (
	"fmt"
	"strings"

	"github.com/mihob/mihob/internal/model"
)

var outboundRulePresetDomains = map[string][]string{
	"ai": {
		"openai.com",
		"chatgpt.com",
		"oaistatic.com",
		"oaiusercontent.com",
		"claude.ai",
		"anthropic.com",
		"gemini.google.com",
		"generativelanguage.googleapis.com",
		"aistudio.google.com",
		"perplexity.ai",
		"grok.com",
		"x.ai",
	},
	"netflix": {
		"netflix.com",
		"netflix.net",
		"nflximg.com",
		"nflximg.net",
		"nflxvideo.net",
		"nflxext.com",
		"nflxso.net",
	},
	"disney": {
		"disneyplus.com",
		"disney-plus.net",
		"bamgrid.com",
		"dssott.com",
		"disneystreaming.com",
	},
	"youtube": {
		"youtube.com",
		"youtu.be",
		"googlevideo.com",
		"ytimg.com",
	},
	"tiktok": {
		"tiktok.com",
		"tiktokv.com",
		"tiktokcdn.com",
		"byteoversea.com",
		"musical.ly",
	},
	"spotify": {
		"spotify.com",
		"scdn.co",
		"spotifycdn.com",
	},
	"google": {
		"google.com",
		"googleapis.com",
		"gstatic.com",
	},
}

func defaultSnifferConfig() map[string]any {
	return map[string]any{
		"enable":        true,
		"parse-pure-ip": true,
		"sniff": map[string]any{
			"HTTP": map[string]any{"ports": []any{80, "8080-8880"}},
			"TLS":  map[string]any{"ports": []any{443, 8443}},
			"QUIC": map[string]any{"ports": []any{443, 8443}},
		},
	}
}

func stripCIDR(addr string) string {
	addr = strings.TrimSpace(addr)
	if host, _, ok := strings.Cut(addr, "/"); ok {
		return strings.TrimSpace(host)
	}
	return addr
}

func boolOrDefault(v *bool, fallback bool) bool {
	if v != nil {
		return *v
	}
	return fallback
}

func attachOutboundDNS(p map[string]any, remoteDNS bool, dnsList []string) {
	if remoteDNS {
		p["remote-dns-resolve"] = true
		if len(dnsList) > 0 {
			p["dns"] = dnsList
		} else {
			p["dns"] = []string{"1.1.1.1", "1.0.0.1"}
		}
	} else if len(dnsList) > 0 {
		p["dns"] = dnsList
	}
}

// buildNodeOutboundProxy converts a structured NodeOutbound into a Mihomo proxy map.
// For `mihob-node`, it emits a directive map expanded later by ExpandServerProxyRefs.
func buildNodeOutboundProxy(o model.NodeOutbound) (map[string]any, error) {
	attachCommon := func(p map[string]any) map[string]any {
		if o.IPVersion != "" && o.IPVersion != "dual" {
			p["ip-version"] = o.IPVersion
		}
		if o.DialerProxy != "" {
			p["dialer-proxy"] = o.DialerProxy
		}
		return p
	}

	switch o.Type {
	case model.OutboundTypeWARP, model.OutboundTypeWireGuard:
		server := o.Server
		port := o.Port
		pubKey := o.PublicKey
		mtu := o.MTU
		remoteDNS := o.RemoteDNSResolve
		dnsList := o.DNS

		if o.Type == model.OutboundTypeWARP {
			if server == "" {
				server = model.DefaultWARPServer
			}
			if port <= 0 {
				port = model.DefaultWARPPort
			}
			if pubKey == "" {
				pubKey = model.DefaultWARPPublicKey
			}
			if mtu <= 0 {
				mtu = model.DefaultWARPMTU
			}
			// WARP works best with remote DNS resolution enabled by default
			if !remoteDNS && len(dnsList) == 0 {
				remoteDNS = true
			}
		}

		p := map[string]any{
			"name":        o.Name,
			"type":        "wireguard",
			"server":      server,
			"port":        port,
			"private-key": o.PrivateKey,
			"public-key":  pubKey,
		}
		if ip := stripCIDR(o.IP); ip != "" {
			p["ip"] = ip
		}
		if ipv6 := stripCIDR(o.IPv6); ipv6 != "" {
			p["ipv6"] = ipv6
		}
		if o.PreSharedKey != "" {
			p["pre-shared-key"] = o.PreSharedKey
		}
		if o.Reserved != "" {
			resBytes, err := model.ParseWireGuardReserved(o.Reserved)
			if err != nil {
				return nil, fmt.Errorf("outbound %q: %w", o.Name, err)
			}
			if len(resBytes) == 3 {
				p["reserved"] = resBytes
			}
		}
		if mtu > 0 {
			p["mtu"] = mtu
		}
		p["udp"] = boolOrDefault(o.UDP, true)
		attachOutboundDNS(p, remoteDNS, dnsList)
		return attachCommon(p), nil

	case model.OutboundTypeMASQUE:
		port := o.Port
		if port <= 0 {
			port = model.DefaultWARPMASQUEPort
		}
		p := map[string]any{
			"name":        o.Name,
			"type":        "masque",
			"server":      o.Server,
			"port":        port,
			"private-key": o.PrivateKey,
			"public-key":  o.PublicKey,
		}
		if o.Network != "" && o.Network != "quic" {
			p["network"] = o.Network
		}
		if o.Network != "h3-l4proxy" {
			if ip := model.EnsureCIDR(o.IP, "/32"); ip != "" {
				p["ip"] = ip
			}
			if ipv6 := model.EnsureCIDR(o.IPv6, "/128"); ipv6 != "" {
				p["ipv6"] = ipv6
			}
		}
		if o.SNI != "" {
			p["sni"] = o.SNI
		}
		if o.MTU > 0 {
			p["mtu"] = o.MTU
		}
		if o.Network == "h3-l4proxy" {
			p["udp"] = false
		} else {
			p["udp"] = boolOrDefault(o.UDP, true)
		}
		if o.SkipCertVerify {
			p["skip-cert-verify"] = true
		}
		if o.CongestionController != "" {
			p["congestion-controller"] = o.CongestionController
		}
		attachOutboundDNS(p, o.RemoteDNSResolve, o.DNS)
		return attachCommon(p), nil

	case model.OutboundTypeSocks5:
		p := map[string]any{
			"name":   o.Name,
			"type":   "socks5",
			"server": o.Server,
			"port":   o.Port,
			"udp":    boolOrDefault(o.UDP, true),
		}
		if o.Username != "" {
			p["username"] = o.Username
		}
		if o.Password != "" {
			p["password"] = o.Password
		}
		if o.TLS {
			p["tls"] = true
			if o.SkipCertVerify {
				p["skip-cert-verify"] = true
			}
		}
		return attachCommon(p), nil

	case model.OutboundTypeHTTP:
		p := map[string]any{
			"name":   o.Name,
			"type":   "http",
			"server": o.Server,
			"port":   o.Port,
		}
		if o.Username != "" {
			p["username"] = o.Username
		}
		if o.Password != "" {
			p["password"] = o.Password
		}
		if o.TLS {
			p["tls"] = true
			if o.SkipCertVerify {
				p["skip-cert-verify"] = true
			}
		}
		return attachCommon(p), nil

	case model.OutboundTypeNode:
		p := map[string]any{
			"name": o.Name,
			"type": ProxyTypeMihobNode,
			"node": o.NodeRef,
		}
		if o.InboundRef != "" {
			p["inbound"] = o.InboundRef
		}
		return attachCommon(p), nil

	default:
		return nil, fmt.Errorf("outbound %q: unsupported type %q", o.Name, o.Type)
	}
}

// mergeProxiesByName merges incoming proxy maps into cfg["proxies"], replacing existing entries
// with the same `name` in place and appending new entries in order.
func mergeProxiesByName(cfg map[string]any, incoming []any) {
	if len(incoming) == 0 {
		return
	}
	var existing []any
	if cur, ok := cfg["proxies"].([]any); ok {
		existing = make([]any, len(cur))
		copy(existing, cur)
	}
	indexByName := make(map[string]int, len(existing))
	for i, item := range existing {
		if m, ok := item.(map[string]any); ok {
			if name := strings.TrimSpace(asString(m["name"])); name != "" {
				indexByName[name] = i
			}
		}
	}
	for _, item := range incoming {
		m, ok := item.(map[string]any)
		if !ok {
			existing = append(existing, item)
			continue
		}
		name := strings.TrimSpace(asString(m["name"]))
		if name != "" {
			if idx, exists := indexByName[name]; exists {
				existing[idx] = m
				continue
			}
			indexByName[name] = len(existing)
		}
		existing = append(existing, m)
	}
	cfg["proxies"] = existing
}

func formatCustomOutboundRule(entry, target string) string {
	entry = strings.TrimSpace(entry)
	if entry == "" {
		return ""
	}
	if !strings.Contains(entry, ",") {
		return fmt.Sprintf("DOMAIN-SUFFIX,%s,%s", entry, target)
	}
	parts := strings.Split(entry, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	if len(parts) == 2 {
		return fmt.Sprintf("%s,%s,%s", parts[0], parts[1], target)
	}
	if len(parts) == 3 && strings.EqualFold(parts[2], "no-resolve") {
		return fmt.Sprintf("%s,%s,%s,no-resolve", parts[0], parts[1], target)
	}
	// Already includes an explicit action/target
	return strings.Join(parts, ",")
}

func isMatchRule(rule any) bool {
	s, ok := rule.(string)
	if !ok {
		return false
	}
	return strings.HasPrefix(strings.ToUpper(strings.TrimSpace(s)), "MATCH,")
}

// ApplyNodeOutboundConfig merges structured node outbounds and optional routing rules into cfg.
func ApplyNodeOutboundConfig(cfg map[string]any, oc *model.NodeOutboundConfig) error {
	if oc == nil {
		return nil
	}
	copyCfg := *oc
	copyCfg.Normalize()

	if len(copyCfg.Outbounds) > 0 {
		proxies := make([]any, 0, len(copyCfg.Outbounds))
		for _, o := range copyCfg.Outbounds {
			if !o.Enabled {
				continue
			}
			p, err := buildNodeOutboundProxy(o)
			if err != nil {
				return err
			}
			proxies = append(proxies, p)
		}
		if len(proxies) > 0 {
			mergeProxiesByName(cfg, proxies)
		}
	}

	mode := copyCfg.Routing.Mode
	target := copyCfg.Routing.Target
	if target == "" || (mode != model.OutboundRouteSplit && mode != model.OutboundRouteGlobal) {
		return nil
	}

	cfg["mode"] = "rule"

	var existingRules []any
	if rawRules, ok := cfg["rules"].([]any); ok {
		existingRules = make([]any, 0, len(rawRules))
		existingRules = append(existingRules, rawRules...)
	}

	switch mode {
	case model.OutboundRouteGlobal:
		filtered := make([]any, 0, len(existingRules)+1)
		for _, r := range existingRules {
			if !isMatchRule(r) {
				filtered = append(filtered, r)
			}
		}
		filtered = append(filtered, "MATCH,"+target)
		cfg["rules"] = filtered

	case model.OutboundRouteSplit:
		if _, hasSniffer := cfg["sniffer"]; !hasSniffer {
			cfg["sniffer"] = defaultSnifferConfig()
		}
		seenRules := make(map[string]bool)
		var splitRules []any
		addRule := func(r string) {
			if r == "" || seenRules[r] {
				return
			}
			seenRules[r] = true
			splitRules = append(splitRules, r)
		}
		for _, preset := range copyCfg.Routing.RulePresets {
			for _, domain := range outboundRulePresetDomains[preset] {
				addRule(fmt.Sprintf("DOMAIN-SUFFIX,%s,%s", domain, target))
			}
		}
		for _, custom := range copyCfg.Routing.CustomDomains {
			addRule(formatCustomOutboundRule(custom, target))
		}

		// Preserve non-MATCH rules from template, insert split rules before MATCH, ensure MATCH fallback exists
		nonMatch := make([]any, 0, len(existingRules))
		var matchRules []any
		for _, r := range existingRules {
			if isMatchRule(r) {
				matchRules = append(matchRules, r)
			} else {
				nonMatch = append(nonMatch, r)
			}
		}
		merged := make([]any, 0, len(nonMatch)+len(splitRules)+max(len(matchRules), 1))
		merged = append(merged, nonMatch...)
		merged = append(merged, splitRules...)
		if len(matchRules) > 0 {
			merged = append(merged, matchRules...)
		} else {
			merged = append(merged, "MATCH,DIRECT")
		}
		cfg["rules"] = merged
	}

	return nil
}
