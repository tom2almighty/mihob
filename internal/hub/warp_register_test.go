package hub

import (
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
)

func TestGenerateWireGuardAndMASQUEKeyPairs(t *testing.T) {
	wgPriv, wgPub, err := crypto.GenerateWireGuardKeyPair()
	if err != nil {
		t.Fatalf("GenerateWireGuardKeyPair: %v", err)
	}
	privRaw, err := base64.StdEncoding.DecodeString(wgPriv)
	if err != nil || len(privRaw) != 32 {
		t.Fatalf("unexpected wg private key: %q (%v)", wgPriv, err)
	}
	pubRaw, err := base64.StdEncoding.DecodeString(wgPub)
	if err != nil || len(pubRaw) != 32 {
		t.Fatalf("unexpected wg public key: %q (%v)", wgPub, err)
	}

	mPriv, mPub, err := crypto.GenerateMASQUEKeyPair()
	if err != nil {
		t.Fatalf("GenerateMASQUEKeyPair: %v", err)
	}
	ecPrivDER, err := base64.StdEncoding.DecodeString(mPriv)
	if err != nil {
		t.Fatalf("decode masque priv: %v", err)
	}
	ecPriv, err := x509.ParseECPrivateKey(ecPrivDER)
	if err != nil {
		t.Fatalf("ParseECPrivateKey: %v", err)
	}
	ecPubDER, err := base64.StdEncoding.DecodeString(mPub)
	if err != nil {
		t.Fatalf("decode masque pub: %v", err)
	}
	ecPubAny, err := x509.ParsePKIXPublicKey(ecPubDER)
	if err != nil {
		t.Fatalf("ParsePKIXPublicKey: %v", err)
	}
	ecPub, ok := ecPubAny.(*ecdsa.PublicKey)
	if !ok || !ecPriv.PublicKey.Equal(ecPub) {
		t.Fatalf("masque keypair mismatch")
	}
}

func TestWARPHelpers(t *testing.T) {
	if got := formatCFClientIDToReserved("DB44"); got != "12, 30, 56" {
		t.Fatalf("unexpected reserved: %q", got)
	}
	if host, port := splitCFEndpointHost("[2606:4700:103::1]:0", 443); host != "2606:4700:103::1" || port != 443 {
		t.Fatalf("unexpected splitCFEndpointHost v6: %q %d", host, port)
	}
	if host, port := splitCFEndpointHost("162.159.192.1:2408", 2408); host != "162.159.192.1" || port != 2408 {
		t.Fatalf("unexpected splitCFEndpointHost v4: %q %d", host, port)
	}
	pemSample := "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----"
	if got := stripPEMToBase64(pemSample); got == "" || got == pemSample {
		t.Fatalf("expected stripped base64 from PEM, got %q", got)
	}
	longBody := []byte(strings.Repeat("error ", 100))
	if got := truncateErrorBody(longBody, 32); len(got) != 35 || !strings.HasSuffix(got, "...") {
		t.Fatalf("unexpected truncated body: %q (len %d)", got, len(got))
	}
}

func TestRegisterCloudflareWARPFlows(t *testing.T) {
	t.Run("wireguard with license refresh", func(t *testing.T) {
		var licenseApplied, refreshed bool
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodPost && r.URL.Path == "/reg":
				_ = json.NewEncoder(w).Encode(map[string]any{
					"id":    "dev-1",
					"token": "tok-1",
					"config": map[string]any{
						"client_id": "DB44",
						"peers": []map[string]any{{
							"public_key": model.DefaultWARPPublicKey,
							"endpoint": map[string]any{
								"v4":   "162.159.192.1:0",
								"v6":   "[2606:4700:d0::a29f:c001]:0",
								"host": "engage.cloudflareclient.com:2408",
							},
						}},
						"interface": map[string]any{
							"addresses": map[string]any{
								"v4": "172.16.0.2",
								"v6": "2606:4700:110::2",
							},
						},
					},
				})
			case r.Method == http.MethodPut && r.URL.Path == "/reg/dev-1/account":
				licenseApplied = true
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"account_type":"plus"}`))
			case r.Method == http.MethodGet && r.URL.Path == "/reg/dev-1":
				refreshed = true
				_ = json.NewEncoder(w).Encode(map[string]any{
					"id":    "dev-1",
					"token": "tok-1",
					"config": map[string]any{
						"client_id": "DB44",
						"peers": []map[string]any{{
							"public_key": model.DefaultWARPPublicKey,
							"endpoint": map[string]any{
								"v4":   "162.159.193.5:2408",
								"v6":   "[2606:4700:d0::a29f:c105]:2408",
								"host": "engage.cloudflareclient.com:2408",
							},
						}},
						"interface": map[string]any{
							"addresses": map[string]any{
								"v4": "172.16.0.3",
								"v6": "2606:4700:110::3",
							},
						},
					},
				})
			default:
				http.Error(w, "unexpected path", http.StatusNotFound)
			}
		}))
		defer srv.Close()

		res, err := registerCloudflareWARPWithBase(context.Background(), srv.Client(), srv.URL, "wireguard", "LIC-123", "")
		if err != nil {
			t.Fatalf("wireguard register failed: %v", err)
		}
		if !licenseApplied || !refreshed {
			t.Fatalf("expected license apply and refresh, got applied=%v refreshed=%v", licenseApplied, refreshed)
		}
		if res.IP != "172.16.0.3/32" || res.IPv6 != "2606:4700:110::3/128" || res.ServerV4 != "162.159.193.5" || res.Reserved != "12, 30, 56" {
			t.Fatalf("unexpected wg result: %+v", res)
		}
	})

	t.Run("masque enrollment", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodPost && r.URL.Path == "/reg":
				_ = json.NewEncoder(w).Encode(map[string]any{"id": "dev-2", "token": "tok-2"})
			case r.Method == http.MethodPatch && r.URL.Path == "/reg/dev-2":
				_ = json.NewEncoder(w).Encode(map[string]any{
					"id":    "dev-2",
					"token": "tok-2",
					"config": map[string]any{
						"peers": []map[string]any{{
							"public_key": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----",
							"endpoint": map[string]any{
								"v4": "162.159.198.2:0",
								"v6": "[2606:4700:104::1]:0",
							},
						}},
						"interface": map[string]any{
							"addresses": map[string]any{
								"v4": "172.16.0.9",
								"v6": "2606:4700:110::9",
							},
						},
					},
				})
			default:
				http.Error(w, "unexpected path", http.StatusNotFound)
			}
		}))
		defer srv.Close()

		res, err := registerCloudflareWARPWithBase(context.Background(), srv.Client(), srv.URL, "masque", "", "")
		if err != nil {
			t.Fatalf("masque register failed: %v", err)
		}
		if res.Protocol != "masque" || res.Server != "162.159.198.2" || res.ServerV6 != "2606:4700:104::1" || res.Port != 443 || res.PublicKey == "" || res.IP != "172.16.0.9/32" || res.SNI != model.DefaultWARPMASQUESNI {
			t.Fatalf("unexpected masque result: %+v", res)
		}
	})

	t.Run("zero trust masque enrollment with jwt", func(t *testing.T) {
		var sawJWT string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodPost && r.URL.Path == "/reg":
				sawJWT = r.Header.Get("Cf-Access-Jwt-Assertion")
				_ = json.NewEncoder(w).Encode(map[string]any{"id": "dev-zt", "token": "tok-zt"})
			case r.Method == http.MethodPatch && r.URL.Path == "/reg/dev-zt":
				_ = json.NewEncoder(w).Encode(map[string]any{
					"id":    "dev-zt",
					"token": "tok-zt",
					"config": map[string]any{
						"peers": []map[string]any{{
							"public_key": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----",
							"endpoint": map[string]any{
								"v4": "162.159.197.2:0",
								"v6": "[2606:4700:103::2]:0",
							},
						}},
						"interface": map[string]any{
							"addresses": map[string]any{
								"v4": "172.16.0.5",
								"v6": "2606:4700:110::5",
							},
						},
					},
				})
			default:
				http.Error(w, "unexpected path", http.StatusNotFound)
			}
		}))
		defer srv.Close()

		res, err := registerCloudflareWARPWithBase(context.Background(), srv.Client(), srv.URL, "masque", "IGNORED-LIC", "eyJ.team.jwt")
		if err != nil {
			t.Fatalf("zt masque register failed: %v", err)
		}
		if sawJWT != "eyJ.team.jwt" {
			t.Fatalf("expected Cf-Access-Jwt-Assertion header, got %q", sawJWT)
		}
		if res.SNI != model.DefaultWARPZeroTrustMASQUESNI || res.Server != "162.159.197.2" {
			t.Fatalf("unexpected zt masque result: %+v", res)
		}
	})

	t.Run("missing masque public key and invalid protocol", func(t *testing.T) {
		if _, err := registerCloudflareWARPWithBase(context.Background(), http.DefaultClient, "http://127.0.0.1", "invalid", "", ""); !errors.Is(err, errInvalidWARPProtocol) {
			t.Fatalf("expected errInvalidWARPProtocol, got %v", err)
		}

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				_ = json.NewEncoder(w).Encode(map[string]any{"id": "dev-3", "token": "tok-3"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"config": map[string]any{
					"peers": []map[string]any{{"public_key": ""}},
				},
			})
		}))
		defer srv.Close()

		if _, err := registerCloudflareWARPWithBase(context.Background(), srv.Client(), srv.URL, "masque", "", ""); err == nil {
			t.Fatalf("expected error when masque peer public_key is empty")
		}
	})

	t.Run("handler returns 400 on invalid protocol", func(t *testing.T) {
		s := &Server{}
		req := httptest.NewRequest(http.MethodPost, "/api/tools/warp-register", strings.NewReader(`{"protocol":"bogus"}`))
		rec := httptest.NewRecorder()
		s.handleWARPRegister(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected HTTP 400, got %d (%s)", rec.Code, rec.Body.String())
		}
	})
}
