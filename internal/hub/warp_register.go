package hub

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
	"github.com/mihob/mihob/internal/model"
)

const (
	cfWARPAPIBase          = "https://api.cloudflareclient.com/v0a4471"
	cfWARPUserAgent        = "WARP for Android"
	cfWARPClientVer        = "a-6.81-4616"
	cfWARPHTTPTimeout      = 20 * time.Second
	cfWARPErrorBodyMaxByte = 256
)

var errInvalidWARPProtocol = errors.New("unsupported WARP protocol")

type warpRegisterResult struct {
	Protocol   string `json:"protocol"` // "wireguard" | "masque"
	PrivateKey string `json:"private_key"`
	PublicKey  string `json:"public_key"`
	IP         string `json:"ip"`
	IPv6       string `json:"ipv6"`
	Server     string `json:"server"`
	ServerV4   string `json:"server_v4,omitempty"`
	ServerV6   string `json:"server_v6,omitempty"`
	Port       int    `json:"port"`
	Reserved   string `json:"reserved,omitempty"`
	SNI        string `json:"sni,omitempty"`
	MTU        int    `json:"mtu"`
}

type cfWARPResponse struct {
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

func cfDoJSON(ctx context.Context, client *http.Client, method, url, bearer string, body any) ([]byte, int, error) {
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
	req.Header.Set("User-Agent", cfWARPUserAgent)
	req.Header.Set("CF-Client-Version", cfWARPClientVer)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
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

func truncateErrorBody(raw []byte, maxLen int) string {
	s := strings.Join(strings.Fields(string(raw)), " ")
	if maxLen <= 0 || len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func splitCFEndpointHost(raw string, defaultPort int) (string, int) {
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

func stripPEMToBase64(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if block, _ := pem.Decode([]byte(trimmed)); block != nil {
		return base64.StdEncoding.EncodeToString(block.Bytes)
	}
	return trimmed
}

func formatCFClientIDToReserved(clientID string) string {
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

func registerCloudflareWARP(ctx context.Context, protocol, license string) (*warpRegisterResult, error) {
	client := &http.Client{Timeout: cfWARPHTTPTimeout}
	return registerCloudflareWARPWithBase(ctx, client, cfWARPAPIBase, protocol, license)
}

func registerCloudflareWARPWithBase(ctx context.Context, client *http.Client, apiBase, protocol, license string) (*warpRegisterResult, error) {
	protocol = strings.ToLower(strings.TrimSpace(protocol))
	if protocol == "" {
		protocol = "wireguard"
	}
	if protocol != "wireguard" && protocol != "masque" {
		return nil, fmt.Errorf("%w %q", errInvalidWARPProtocol, protocol)
	}
	apiBase = strings.TrimRight(apiBase, "/")

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

	raw, status, err := cfDoJSON(ctx, client, http.MethodPost, apiBase+"/reg", "", regPayload)
	if err != nil {
		return nil, fmt.Errorf("cloudflare register request failed: %w", err)
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("cloudflare register returned HTTP %d: %s", status, truncateErrorBody(raw, cfWARPErrorBodyMaxByte))
	}

	var account cfWARPResponse
	if err := json.Unmarshal(raw, &account); err != nil {
		return nil, fmt.Errorf("decode cloudflare register response: %w", err)
	}
	if account.ID == "" || account.Token == "" {
		return nil, fmt.Errorf("cloudflare register returned empty device id or token")
	}

	license = strings.TrimSpace(license)
	if license != "" {
		licRaw, licStatus, err := cfDoJSON(ctx, client, http.MethodPut, fmt.Sprintf("%s/reg/%s/account", apiBase, account.ID), account.Token, map[string]string{
			"license": license,
		})
		if err != nil {
			return nil, fmt.Errorf("apply WARP+ license failed: %w", err)
		}
		if licStatus < 200 || licStatus >= 300 {
			return nil, fmt.Errorf("apply WARP+ license returned HTTP %d: %s", licStatus, truncateErrorBody(licRaw, cfWARPErrorBodyMaxByte))
		}
		if protocol == "wireguard" {
			refRaw, refStatus, err := cfDoJSON(ctx, client, http.MethodGet, fmt.Sprintf("%s/reg/%s", apiBase, account.ID), account.Token, nil)
			if err == nil && refStatus >= 200 && refStatus < 300 {
				var refreshed cfWARPResponse
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
		v4Host, v4Port := splitCFEndpointHost(peer.Endpoint.V4, model.DefaultWARPPort)
		v6Host, _ := splitCFEndpointHost(peer.Endpoint.V6, v4Port)
		hostDomain, port := splitCFEndpointHost(peer.Endpoint.Host, v4Port)
		server := hostDomain
		if server == "" {
			server = v4Host
		}
		if server == "" {
			server = model.DefaultWARPServer
		}
		pubKey := strings.TrimSpace(peer.PublicKey)
		if pubKey == "" {
			pubKey = model.DefaultWARPPublicKey
		}
		return &warpRegisterResult{
			Protocol:   "wireguard",
			PrivateKey: wgPriv,
			PublicKey:  pubKey,
			IP:         model.EnsureCIDR(account.Config.Interface.Addresses.V4, "/32"),
			IPv6:       model.EnsureCIDR(account.Config.Interface.Addresses.V6, "/128"),
			Server:     server,
			ServerV4:   v4Host,
			ServerV6:   v6Host,
			Port:       port,
			Reserved:   formatCFClientIDToReserved(account.Config.ClientID),
			MTU:        model.DefaultWARPMTU,
		}, nil
	}

	// MASQUE enrollment
	ecPriv, ecPub, err := crypto.GenerateMASQUEKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generate masque keypair: %w", err)
	}
	enrollRaw, enrollStatus, err := cfDoJSON(ctx, client, http.MethodPatch, fmt.Sprintf("%s/reg/%s", apiBase, account.ID), account.Token, map[string]string{
		"key":         ecPub,
		"key_type":    "secp256r1",
		"tunnel_type": "masque",
	})
	if err != nil {
		return nil, fmt.Errorf("cloudflare masque enroll failed: %w", err)
	}
	if enrollStatus < 200 || enrollStatus >= 300 {
		return nil, fmt.Errorf("cloudflare masque enroll returned HTTP %d: %s", enrollStatus, truncateErrorBody(enrollRaw, cfWARPErrorBodyMaxByte))
	}

	var enrolled cfWARPResponse
	if err := json.Unmarshal(enrollRaw, &enrolled); err != nil {
		return nil, fmt.Errorf("decode cloudflare masque response: %w", err)
	}
	if len(enrolled.Config.Peers) == 0 {
		return nil, fmt.Errorf("cloudflare masque response missing peer config")
	}
	peer := enrolled.Config.Peers[0]
	pubKey := stripPEMToBase64(peer.PublicKey)
	if pubKey == "" {
		return nil, fmt.Errorf("cloudflare masque response missing peer public key")
	}
	v4Host, port := splitCFEndpointHost(peer.Endpoint.V4, model.DefaultWARPMASQUEPort)
	v6Host, _ := splitCFEndpointHost(peer.Endpoint.V6, port)
	if v4Host == "" {
		v4Host = model.DefaultWARPMASQUEServer
	}
	return &warpRegisterResult{
		Protocol:   "masque",
		PrivateKey: ecPriv,
		PublicKey:  pubKey,
		IP:         model.EnsureCIDR(enrolled.Config.Interface.Addresses.V4, "/32"),
		IPv6:       model.EnsureCIDR(enrolled.Config.Interface.Addresses.V6, "/128"),
		Server:     v4Host,
		ServerV4:   v4Host,
		ServerV6:   v6Host,
		Port:       port,
		SNI:        model.DefaultWARPMASQUESNI,
		MTU:        model.DefaultWARPMASQUEMTU,
	}, nil
}

func (s *Server) handleWARPRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Protocol string `json:"protocol"` // "wireguard" | "masque"
		License  string `json:"license"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()

	res, err := registerCloudflareWARP(ctx, req.Protocol, req.License)
	if err != nil {
		if errors.Is(err, errInvalidWARPProtocol) {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}
