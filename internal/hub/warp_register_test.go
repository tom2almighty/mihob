package hub

import (
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"testing"

	"github.com/mihob/mihob/internal/crypto"
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
}
