package model

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
)

const (
	OutboundTypeWARP      = "warp"
	OutboundTypeWireGuard = "wireguard"
	OutboundTypeMASQUE    = "masque"
	OutboundTypeSocks5    = "socks5"
	OutboundTypeHTTP      = "http"
	OutboundTypeNode      = "mihob-node"
)

const (
	OutboundRouteNone   = "none"
	OutboundRouteSplit  = "split"
	OutboundRouteGlobal = "global"
)

const (
	DefaultWARPServer       = "engage.cloudflareclient.com"
	DefaultWARPPort         = 2408
	DefaultWARPPublicKey    = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
	DefaultWARPMTU          = 1280
	DefaultWARPMASQUEServer = "162.159.198.1"
	DefaultWARPMASQUEPort   = 443
	DefaultWARPMASQUESNI    = "consumer-masque.cloudflareclient.com"
	DefaultWARPMASQUEMTU    = 1280
)

type NodeOutboundConfig struct {
	Outbounds []NodeOutbound      `json:"outbounds,omitempty"`
	Routing   NodeOutboundRouting `json:"routing"`
}

type NodeOutbound struct {
	Name    string `json:"name"`
	Type    string `json:"type"` // "warp" | "masque" | "wireguard" | "socks5" | "http" | "mihob-node"
	Enabled bool   `json:"enabled"`

	// Shared proxy server fields (warp / masque / wireguard / socks5 / http)
	Server string `json:"server,omitempty"`
	Port   int    `json:"port,omitempty"`

	// SOCKS5 / HTTP auth & TLS (skip_cert_verify also applies to MASQUE)
	Username       string `json:"username,omitempty"`
	Password       string `json:"password,omitempty"`
	TLS            bool   `json:"tls,omitempty"`
	SkipCertVerify bool   `json:"skip_cert_verify,omitempty"`
	UDP            *bool  `json:"udp,omitempty"`

	// WireGuard / Cloudflare WARP / MASQUE fields
	IP               string   `json:"ip,omitempty"`
	IPv6             string   `json:"ipv6,omitempty"`
	PrivateKey       string   `json:"private_key,omitempty"`
	PublicKey        string   `json:"public_key,omitempty"`
	PreSharedKey     string   `json:"pre_shared_key,omitempty"`
	Reserved         string   `json:"reserved,omitempty"`
	MTU              int      `json:"mtu,omitempty"`
	RemoteDNSResolve bool     `json:"remote_dns_resolve,omitempty"`
	DNS              []string `json:"dns,omitempty"`

	// MASQUE specific fields
	SNI                  string `json:"sni,omitempty"`
	Network              string `json:"network,omitempty"`               // "" | "quic" | "h2" | "h3-l4proxy"
	CongestionController string `json:"congestion_controller,omitempty"` // "" | "bbr"

	// Cluster node reference (type: "mihob-node")
	NodeRef    string `json:"node_ref,omitempty"`
	InboundRef string `json:"inbound_ref,omitempty"`

	// Common proxy options
	IPVersion   string `json:"ip_version,omitempty"` // "" | "dual" | "ipv4" | "ipv6" | "ipv4-prefer" | "ipv6-prefer"
	DialerProxy string `json:"dialer_proxy,omitempty"`
}

type NodeOutboundRouting struct {
	Mode          string   `json:"mode,omitempty"`           // "" | "none" | "split" | "global"
	Target        string   `json:"target,omitempty"`         // Target outbound name
	RulePresets   []string `json:"rule_presets,omitempty"`   // "ai" | "netflix" | "disney" | "youtube" | "tiktok" | "spotify" | "google"
	CustomDomains []string `json:"custom_domains,omitempty"` // Domain suffixes or raw Mihomo rule lines
}

var reservedOutboundNames = map[string]bool{
	"DIRECT":      true,
	"REJECT":      true,
	"REJECT-DROP": true,
	"PASS":        true,
	"COMPATIBLE":  true,
}

func IsValidOutboundType(t string) bool {
	switch t {
	case OutboundTypeWARP, OutboundTypeWireGuard, OutboundTypeMASQUE, OutboundTypeSocks5, OutboundTypeHTTP, OutboundTypeNode:
		return true
	default:
		return false
	}
}

func IsValidOutboundIPVersion(v string) bool {
	switch v {
	case "", "dual", "ipv4", "ipv6", "ipv4-prefer", "ipv6-prefer":
		return true
	default:
		return false
	}
}

func IsValidMASQUENetwork(n string) bool {
	switch n {
	case "", "quic", "h2", "h3-l4proxy":
		return true
	default:
		return false
	}
}

func IsValidMASQUECongestionController(cc string) bool {
	switch cc {
	case "", "bbr":
		return true
	default:
		return false
	}
}

// EnsureCIDR appends suffix (e.g. "/32" or "/128") when addr is non-empty and lacks a prefix length.
func EnsureCIDR(addr, suffix string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" || strings.Contains(addr, "/") {
		return addr
	}
	return addr + suffix
}

func IsValidOutboundRouteMode(m string) bool {
	switch m {
	case "", OutboundRouteNone, OutboundRouteSplit, OutboundRouteGlobal:
		return true
	default:
		return false
	}
}

// ParseWireGuardReserved parses either comma-separated 3 bytes (e.g. "12,34,56" or "[12, 34, 56]")
// or a base64-encoded 3-byte client_id into a 3-element int slice.
func ParseWireGuardReserved(raw string) ([]int, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, nil
	}
	trimmed := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(s, "["), "]"))
	if strings.Contains(trimmed, ",") {
		parts := strings.Split(trimmed, ",")
		if len(parts) != 3 {
			return nil, fmt.Errorf("reserved must contain exactly 3 bytes")
		}
		out := make([]int, 3)
		for i, p := range parts {
			v, err := strconv.Atoi(strings.TrimSpace(p))
			if err != nil || v < 0 || v > 255 {
				return nil, fmt.Errorf("reserved byte %d must be an integer between 0 and 255", i+1)
			}
			out[i] = v
		}
		return out, nil
	}
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(s)
	}
	if err != nil || len(decoded) != 3 {
		return nil, fmt.Errorf("reserved must be 3 comma-separated integers (0-255) or a 3-byte base64 string")
	}
	return []int{int(decoded[0]), int(decoded[1]), int(decoded[2])}, nil
}

func (c *NodeOutboundConfig) Normalize() {
	if c == nil {
		return
	}
	if c.Outbounds == nil {
		c.Outbounds = []NodeOutbound{}
	}
	for i := range c.Outbounds {
		o := &c.Outbounds[i]
		o.Name = strings.TrimSpace(o.Name)
		o.Type = strings.ToLower(strings.TrimSpace(o.Type))
		o.Server = strings.TrimSpace(o.Server)
		o.Username = strings.TrimSpace(o.Username)
		o.IP = strings.TrimSpace(o.IP)
		o.IPv6 = strings.TrimSpace(o.IPv6)
		o.PrivateKey = strings.TrimSpace(o.PrivateKey)
		o.PublicKey = strings.TrimSpace(o.PublicKey)
		o.PreSharedKey = strings.TrimSpace(o.PreSharedKey)
		o.Reserved = strings.TrimSpace(o.Reserved)
		o.SNI = strings.TrimSpace(o.SNI)
		o.Network = strings.ToLower(strings.TrimSpace(o.Network))
		o.CongestionController = strings.ToLower(strings.TrimSpace(o.CongestionController))
		o.NodeRef = strings.TrimSpace(o.NodeRef)
		o.InboundRef = strings.TrimSpace(o.InboundRef)
		o.IPVersion = strings.ToLower(strings.TrimSpace(o.IPVersion))
		o.DialerProxy = strings.TrimSpace(o.DialerProxy)
		if len(o.DNS) > 0 {
			cleaned := make([]string, 0, len(o.DNS))
			for _, d := range o.DNS {
				if td := strings.TrimSpace(d); td != "" {
					cleaned = append(cleaned, td)
				}
			}
			o.DNS = cleaned
		}
	}

	c.Routing.Mode = strings.ToLower(strings.TrimSpace(c.Routing.Mode))
	if c.Routing.Mode == "" {
		c.Routing.Mode = OutboundRouteNone
	}
	c.Routing.Target = strings.TrimSpace(c.Routing.Target)
	if len(c.Routing.RulePresets) > 0 {
		seen := map[string]bool{}
		cleaned := make([]string, 0, len(c.Routing.RulePresets))
		for _, p := range c.Routing.RulePresets {
			p = strings.ToLower(strings.TrimSpace(p))
			if p != "" && !seen[p] {
				seen[p] = true
				cleaned = append(cleaned, p)
			}
		}
		c.Routing.RulePresets = cleaned
	}
	if len(c.Routing.CustomDomains) > 0 {
		seen := map[string]bool{}
		cleaned := make([]string, 0, len(c.Routing.CustomDomains))
		for _, d := range c.Routing.CustomDomains {
			d = strings.TrimSpace(d)
			if d != "" && !seen[d] {
				seen[d] = true
				cleaned = append(cleaned, d)
			}
		}
		c.Routing.CustomDomains = cleaned
	}
}

func (c *NodeOutboundConfig) Validate() error {
	if c == nil {
		return nil
	}
	seenNames := map[string]bool{}
	for i, o := range c.Outbounds {
		if o.Name == "" {
			return fmt.Errorf("outbound[%d]: name is required", i)
		}
		if reservedOutboundNames[strings.ToUpper(o.Name)] {
			return fmt.Errorf("outbound %q: name is reserved by Mihomo", o.Name)
		}
		key := strings.ToLower(o.Name)
		if seenNames[key] {
			return fmt.Errorf("outbound %q: duplicate outbound name", o.Name)
		}
		seenNames[key] = true

		if !IsValidOutboundType(o.Type) {
			return fmt.Errorf("outbound %q: unsupported type %q", o.Name, o.Type)
		}
		if !IsValidOutboundIPVersion(o.IPVersion) {
			return fmt.Errorf("outbound %q: unsupported ip_version %q", o.Name, o.IPVersion)
		}
		if !o.Enabled {
			continue
		}

		switch o.Type {
		case OutboundTypeWARP:
			if o.PrivateKey == "" {
				return fmt.Errorf("outbound %q: WARP private key is required", o.Name)
			}
			if o.IP == "" && o.IPv6 == "" {
				return fmt.Errorf("outbound %q: WARP IPv4 or IPv6 address is required", o.Name)
			}
			if o.Port != 0 && (o.Port < 1 || o.Port > 65535) {
				return fmt.Errorf("outbound %q: port must be between 1 and 65535", o.Name)
			}
			if o.Reserved != "" {
				if _, err := ParseWireGuardReserved(o.Reserved); err != nil {
					return fmt.Errorf("outbound %q: %w", o.Name, err)
				}
			}
		case OutboundTypeWireGuard:
			if o.Server == "" {
				return fmt.Errorf("outbound %q: WireGuard server is required", o.Name)
			}
			if o.Port < 1 || o.Port > 65535 {
				return fmt.Errorf("outbound %q: WireGuard port must be between 1 and 65535", o.Name)
			}
			if o.PrivateKey == "" || o.PublicKey == "" {
				return fmt.Errorf("outbound %q: WireGuard private key and public key are required", o.Name)
			}
			if o.IP == "" && o.IPv6 == "" {
				return fmt.Errorf("outbound %q: WireGuard IPv4 or IPv6 address is required", o.Name)
			}
			if o.Reserved != "" {
				if _, err := ParseWireGuardReserved(o.Reserved); err != nil {
					return fmt.Errorf("outbound %q: %w", o.Name, err)
				}
			}
		case OutboundTypeMASQUE:
			if o.Server == "" {
				return fmt.Errorf("outbound %q: MASQUE server is required", o.Name)
			}
			if o.Port != 0 && (o.Port < 1 || o.Port > 65535) {
				return fmt.Errorf("outbound %q: MASQUE port must be between 1 and 65535", o.Name)
			}
			if o.PrivateKey == "" || o.PublicKey == "" {
				return fmt.Errorf("outbound %q: MASQUE private key and public key are required", o.Name)
			}
			if !IsValidMASQUENetwork(o.Network) {
				return fmt.Errorf("outbound %q: unsupported MASQUE network %q", o.Name, o.Network)
			}
			if !IsValidMASQUECongestionController(o.CongestionController) {
				return fmt.Errorf("outbound %q: unsupported MASQUE congestion controller %q", o.Name, o.CongestionController)
			}
			if o.Network != "h3-l4proxy" && o.IP == "" && o.IPv6 == "" {
				return fmt.Errorf("outbound %q: MASQUE IPv4 or IPv6 address is required", o.Name)
			}
		case OutboundTypeSocks5, OutboundTypeHTTP:
			if o.Server == "" {
				return fmt.Errorf("outbound %q: server address is required", o.Name)
			}
			if o.Port < 1 || o.Port > 65535 {
				return fmt.Errorf("outbound %q: port must be between 1 and 65535", o.Name)
			}
		case OutboundTypeNode:
			if o.NodeRef == "" {
				return fmt.Errorf("outbound %q: target node reference is required", o.Name)
			}
		}
	}

	if !IsValidOutboundRouteMode(c.Routing.Mode) {
		return fmt.Errorf("invalid outbound routing mode %q", c.Routing.Mode)
	}
	if (c.Routing.Mode == OutboundRouteSplit || c.Routing.Mode == OutboundRouteGlobal) && c.Routing.Target == "" {
		return fmt.Errorf("outbound routing target is required for mode %q", c.Routing.Mode)
	}
	return nil
}
