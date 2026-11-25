package warp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mihob/mihob/internal/crypto"
)

const (
	DefaultAPIBase        = "https://api.cloudflareclient.com/v0a4471"
	cfUserAgent           = "WARP for Android"
	cfClientVersion       = "a-6.81-4616"
	defaultHTTPTimeout    = 20 * time.Second
	errorBodyMaxByte      = 256
	DefaultServer         = "engage.cloudflareclient.com"
	DefaultPort           = 2408
	DefaultPublicKey      = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
	DefaultMTU            = 1280
	DefaultMASQUEServer   = "162.159.198.1"
	DefaultMASQUEPort     = 443
	DefaultMASQUESNI      = "consumer-masque.cloudflareclient.com"
	DefaultZeroTrustSNI   = "zt-masque.cloudflareclient.com"
	DefaultMASQUEMTU      = 1280
)

var ErrInvalidProtocol = errors.New("unsupported WARP protocol")

type Result struct {
	Protocol     string `json:"protocol"` // "wireguard" | "masque"
	PrivateKey   string `json:"private_key"`
	PublicKey    string `json:"public_key"`
	IP           string `json:"ip"`
	IPv6         string `json:"ipv6"`
	Server       string `json:"server"`
	ServerV4     string `json:"server_v4,omitempty"`
	ServerV6     string `json:"server_v6,omitempty"`
	Port         int    `json:"port"`
	Reserved     string `json:"reserved,omitempty"`
	SNI          string `json:"sni,omitempty"`
	MTU          int    `json:"mtu"`
	RegisteredBy string `json:"registered_by,omitempty"` // "agent" | "hub"
}

type cfResponse struct {
	ID     string `json:"id"`
	Token  string `json:"token"`
	Config struct {
		ClientID string `json:"client_id"`
		Peers    []struct {
			PublicKey string `json:"public_key"`
			Endpoint  struct {
				V4   string `json:"v4"`
				V6   string `json:"v6"`
				Host string `json:"host"`
			} `json:"endpoint"`
		} `json:"peers"`
		Interface struct {
			Addresses struct {
				V4 string `json:"v4"`
				V6 string `json:"v6"`
			} `json:"addresses"`
		} `json:"interface"`
	} `json:"config"`
}

func doJSON(ctx context.Context, client *http.Client, method, url, bearer string, extraHeaders map[string]string, body any) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		bodyReader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json; charset=UTF-8")
	req.Header.Set("User-Agent", cfUserAgent)
	req.Header.Set("CF-Client-Version", cfClientVersion)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	for k, v := range extraHeaders {
		if strings.TrimSpace(v) != "" {
			req.Header.Set(k, v)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return raw, resp.StatusCode, nil
}

func ensureCIDR(addr, suffix string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" || strings.Contains(addr, "/") {
		return addr
	}
	return addr + suffix
}

func TruncateErrorBody(raw []byte, maxLen int) string {
	s := strings.Join(strings.Fields(string(raw)), " ")
	if maxLen <= 0 || len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func SplitEndpointHost(raw string, defaultPort int) (string, int) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", defaultPort
	}
	host, portStr, err := net.SplitHostPort(raw)
	if err != nil {
		return strings.Trim(raw, "[]"), defaultPort
	}
	p, err := strconv.Atoi(portStr)
	if err != nil || p <= 0 {
		p = defaultPort
	}
	return strings.Trim(host, "[]"), p
}

func StripPEMToBase64(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if block, _ := pem.Decode([]byte(trimmed)); block != nil {
		return base64.StdEncoding.EncodeToString(block.Bytes)
	}
	return trimmed
}

func FormatClientIDToReserved(clientID string) string {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return ""
	}
	decoded, err := base64.StdEncoding.DecodeString(clientID)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(clientID)
	}
	if err != nil || len(decoded) < 3 {
		return ""
	}
	return fmt.Sprintf("%d, %d, %d", decoded[0], decoded[1], decoded[2])
}

func Register(ctx context.Context, protocol, license, jwt string) (*Result, error) {
	client := &http.Client{Timeout: defaultHTTPTimeout}
	return RegisterWithBase(ctx, client, DefaultAPIBase, protocol, license, jwt)
}

func RegisterWithBase(ctx context.Context, client *http.Client, apiBase, protocol, license, jwt string) (*Result, error) {
	protocol = strings.ToLower(strings.TrimSpace(protocol))
	if protocol == "" {
		protocol = "wireguard"
	}
	if protocol != "wireguard" && protocol != "masque" {
		return nil, fmt.Errorf("%w %q", ErrInvalidProtocol, protocol)
	}
	apiBase = strings.TrimRight(apiBase, "/")
	jwt = strings.TrimSpace(jwt)
	license = strings.TrimSpace(license)

	wgPriv, wgPub, err := crypto.GenerateWireGuardKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generate wireguard keypair: %w", err)
	}

	regPayload := map[string]any{
		"key":        wgPub,
		"install_id": "",
		"fcm_token":  "",
		"tos":        time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		"model":      "Android",
		"type":       "Android",
		"locale":     "en_US",
	}

	var regHeaders map[string]string
	if jwt != "" {
		regHeaders = map[string]string{
			"Cf-Access-Jwt-Assertion": jwt,
		}
	}

	raw, status, err := doJSON(ctx, client, http.MethodPost, apiBase+"/reg", "", regHeaders, regPayload)
	if err != nil {
		return nil, fmt.Errorf("cloudflare register request failed: %w", err)
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("cloudflare register returned HTTP %d: %s", status, TruncateErrorBody(raw, errorBodyMaxByte))
	}

	var account cfResponse
	if err := json.Unmarshal(raw, &account); err != nil {
		return nil, fmt.Errorf("decode cloudflare register response: %w", err)
	}
	if account.ID == "" || account.Token == "" {
		return nil, fmt.Errorf("cloudflare register returned empty device id or token")
	}

	if jwt == "" && license != "" {
		licRaw, licStatus, err := doJSON(ctx, client, http.MethodPut, fmt.Sprintf("%s/reg/%s/account", apiBase, account.ID), account.Token, nil, map[string]string{
			"license": license,
		})
		if err != nil {
			return nil, fmt.Errorf("apply WARP+ license failed: %w", err)
		}
		if licStatus < 200 || licStatus >= 300 {
			return nil, fmt.Errorf("apply WARP+ license returned HTTP %d: %s", licStatus, TruncateErrorBody(licRaw, errorBodyMaxByte))
		}
		if protocol == "wireguard" {
			refRaw, refStatus, err := doJSON(ctx, client, http.MethodGet, fmt.Sprintf("%s/reg/%s", apiBase, account.ID), account.Token, nil, nil)
			if err == nil && refStatus >= 200 && refStatus < 300 {
				var refreshed cfResponse
				if json.Unmarshal(refRaw, &refreshed) == nil && len(refreshed.Config.Peers) > 0 {
					account = refreshed
				}
			}
		}
	}

	if protocol == "wireguard" {
		if len(account.Config.Peers) == 0 {
			return nil, fmt.Errorf("cloudflare response missing wireguard peer config")
		}
		peer := account.Config.Peers[0]
		v4Host, v4Port := SplitEndpointHost(peer.Endpoint.V4, DefaultPort)
		v6Host, _ := SplitEndpointHost(peer.Endpoint.V6, v4Port)
		hostDomain, port := SplitEndpointHost(peer.Endpoint.Host, v4Port)
		server := hostDomain
		if server == "" {
			server = v4Host
		}
		if server == "" {
			server = DefaultServer
		}
		pubKey := strings.TrimSpace(peer.PublicKey)
		if pubKey == "" {
			pubKey = DefaultPublicKey
		}
		return &Result{
			Protocol:   "wireguard",
			PrivateKey: wgPriv,
			PublicKey:  pubKey,
			IP:         ensureCIDR(account.Config.Interface.Addresses.V4, "/32"),
			IPv6:       ensureCIDR(account.Config.Interface.Addresses.V6, "/128"),
			Server:     server,
			ServerV4:   v4Host,
			ServerV6:   v6Host,
			Port:       port,
			Reserved:   FormatClientIDToReserved(account.Config.ClientID),
			MTU:        DefaultMTU,
		}, nil
	}

	// MASQUE enrollment
	ecPriv, ecPub, err := crypto.GenerateMASQUEKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generate masque keypair: %w", err)
	}
	enrollRaw, enrollStatus, err := doJSON(ctx, client, http.MethodPatch, fmt.Sprintf("%s/reg/%s", apiBase, account.ID), account.Token, nil, map[string]string{
		"key":         ecPub,
		"key_type":    "secp256r1",
		"tunnel_type": "masque",
	})
	if err != nil {
		return nil, fmt.Errorf("cloudflare masque enroll failed: %w", err)
	}
	if enrollStatus < 200 || enrollStatus >= 300 {
		return nil, fmt.Errorf("cloudflare masque enroll returned HTTP %d: %s", enrollStatus, TruncateErrorBody(enrollRaw, errorBodyMaxByte))
	}

	var enrolled cfResponse
	if err := json.Unmarshal(enrollRaw, &enrolled); err != nil {
		return nil, fmt.Errorf("decode cloudflare masque response: %w", err)
	}
	if len(enrolled.Config.Peers) == 0 {
		return nil, fmt.Errorf("cloudflare masque response missing peer config")
	}
	peer := enrolled.Config.Peers[0]
	pubKey := StripPEMToBase64(peer.PublicKey)
	if pubKey == "" {
		return nil, fmt.Errorf("cloudflare masque response missing peer public key")
	}
	v4Host, port := SplitEndpointHost(peer.Endpoint.V4, DefaultMASQUEPort)
	v6Host, _ := SplitEndpointHost(peer.Endpoint.V6, port)
	if v4Host == "" {
		v4Host = DefaultMASQUEServer
	}
	sni := DefaultMASQUESNI
	if jwt != "" {
		sni = DefaultZeroTrustSNI
	}
	return &Result{
		Protocol:   "masque",
		PrivateKey: ecPriv,
		PublicKey:  pubKey,
		IP:         ensureCIDR(enrolled.Config.Interface.Addresses.V4, "/32"),
		IPv6:       ensureCIDR(enrolled.Config.Interface.Addresses.V6, "/128"),
		Server:     v4Host,
		ServerV4:   v4Host,
		ServerV6:   v6Host,
		Port:       port,
		SNI:        sni,
		MTU:        DefaultMASQUEMTU,
	}, nil
}
