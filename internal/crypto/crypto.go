package crypto

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"net"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/curve25519"
)

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

func RandomHex(nBytes int) string {
	b := make([]byte, nBytes)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func RandomToken(nBytes int) string {
	b := make([]byte, nBytes)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func RandomBase64(nBytes int) string {
	b := make([]byte, nBytes)
	_, _ = rand.Read(b)
	return base64.StdEncoding.EncodeToString(b)
}

func NewUUID() string {
	return uuid.NewString()
}

func SHA256Hex(data string) string {
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

// GenerateRealityKeyPair generates an X25519 keypair encoded with RawURLEncoding,
// matching `mihomo generate reality-keypair`.
func GenerateRealityKeyPair() (privateKey string, publicKey string, err error) {
	priv, pub, err := generateX25519KeyPair()
	if err != nil {
		return "", "", err
	}
	return base64.RawURLEncoding.EncodeToString(priv[:]),
		base64.RawURLEncoding.EncodeToString(pub),
		nil
}

// GenerateWireGuardKeyPair generates a standard Curve25519 WireGuard keypair in StdEncoding Base64.
func GenerateWireGuardKeyPair() (privateKey string, publicKey string, err error) {
	priv, pub, err := generateX25519KeyPair()
	if err != nil {
		return "", "", err
	}
	return base64.StdEncoding.EncodeToString(priv[:]),
		base64.StdEncoding.EncodeToString(pub),
		nil
}

// GenerateMASQUEKeyPair generates an ECDSA P-256 keypair encoded in Base64 DER
// (SEC1 ECPrivateKey for private_key, PKIX SPKI for public_key), matching Mihomo / usque MASQUE expectations.
func GenerateMASQUEKeyPair() (privateKey string, publicKey string, err error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", "", err
	}
	privDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return "", "", err
	}
	pubDER, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		return "", "", err
	}
	return base64.StdEncoding.EncodeToString(privDER),
		base64.StdEncoding.EncodeToString(pubDER),
		nil
}

func generateX25519KeyPair() ([32]byte, []byte, error) {
	var priv [32]byte
	if _, err := rand.Read(priv[:]); err != nil {
		return priv, nil, err
	}
	// Standard Curve25519 clamping
	priv[0] &= 248
	priv[31] &= 127
	priv[31] |= 64

	pub, err := curve25519.X25519(priv[:], curve25519.Basepoint)
	if err != nil {
		return priv, nil, err
	}
	return priv, pub, nil
}

func GenerateShortID() string {
	return RandomHex(4) // 8 hex chars
}

// GenerateSelfSignedCert creates an ECDSA P-256 self-signed certificate valid for days.
func GenerateSelfSignedCert(domain string, sans []string, validDays int) (certPEM, keyPEM string, notBefore, notAfter time.Time, err error) {
	if validDays <= 0 {
		validDays = 3650
	}
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", "", time.Time{}, time.Time{}, err
	}
	serialLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serial, err := rand.Int(rand.Reader, serialLimit)
	if err != nil {
		return "", "", time.Time{}, time.Time{}, err
	}
	now := time.Now().UTC().Add(-5 * time.Minute)
	expiry := now.Add(time.Duration(validDays) * 24 * time.Hour)

	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   domain,
			Organization: []string{"mihob self-signed"},
		},
		NotBefore:             now,
		NotAfter:              expiry,
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	seen := map[string]struct{}{}
	addHost := func(h string) {
		h = strings.TrimSpace(h)
		if h == "" {
			return
		}
		if _, ok := seen[h]; ok {
			return
		}
		seen[h] = struct{}{}
		if ip := net.ParseIP(h); ip != nil {
			tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
		} else {
			tmpl.DNSNames = append(tmpl.DNSNames, h)
		}
	}
	addHost(domain)
	for _, s := range sans {
		addHost(s)
	}

	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		return "", "", time.Time{}, time.Time{}, err
	}
	keyDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return "", "", time.Time{}, time.Time{}, err
	}
	cPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	kPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	return string(cPEM), string(kPEM), now, expiry, nil
}

type CertMetadata struct {
	CommonName  string
	SANs        []string
	Issuer      string
	NotBefore   time.Time
	NotAfter    time.Time
	Fingerprint string
}

// CertFingerprintSHA256 returns the lowercase hex SHA-256 fingerprint of the leaf
// X.509 certificate in certPEM, matching Mihomo's TLS `fingerprint` field.
func CertFingerprintSHA256(certPEM string) string {
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return ""
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(cert.Raw)
	return hex.EncodeToString(sum[:])
}

// NormalizeCertFingerprint cleans a user-supplied SHA-256 certificate fingerprint
// (e.g. output from `openssl x509 -noout -fingerprint -sha256` or Chrome's viewer)
// into a compact lowercase hex string suitable for Mihomo's `fingerprint` field.
func NormalizeCertFingerprint(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	for _, prefix := range []string{"sha256 fingerprint=", "sha-256 fingerprint=", "sha256:", "sha-256:"} {
		if strings.HasPrefix(lower, prefix) {
			s = strings.TrimSpace(s[len(prefix):])
			break
		}
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == ':' || r == ' ' || r == '\t' || r == '\r' || r == '\n' {
			continue
		}
		b.WriteRune(r)
	}
	return strings.ToLower(b.String())
}

func ParseCertPEM(certPEM, keyPEM string) (*CertMetadata, error) {
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return nil, errors.New("invalid certificate PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse x509 cert: %w", err)
	}
	if strings.TrimSpace(keyPEM) != "" {
		kblock, _ := pem.Decode([]byte(keyPEM))
		if kblock == nil {
			return nil, errors.New("invalid private key PEM")
		}
	}
	var sans []string
	sans = append(sans, cert.DNSNames...)
	for _, ip := range cert.IPAddresses {
		sans = append(sans, ip.String())
	}
	issuer := cert.Issuer.CommonName
	if issuer == "" && len(cert.Issuer.Organization) > 0 {
		issuer = cert.Issuer.Organization[0]
	}
	sum := sha256.Sum256(cert.Raw)
	return &CertMetadata{
		CommonName:  cert.Subject.CommonName,
		SANs:        sans,
		Issuer:      issuer,
		NotBefore:   cert.NotBefore,
		NotAfter:    cert.NotAfter,
		Fingerprint: hex.EncodeToString(sum[:]),
	}, nil
}

type AdminClaims struct {
	AdminID  int64  `json:"aid"`
	Username string `json:"usr"`
	jwt.RegisteredClaims
}

func SignAdminJWT(secret string, adminID int64, username string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := AdminClaims{
		AdminID:  adminID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			Issuer:    "mihob",
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString([]byte(secret))
}

func VerifyAdminJWT(secret, tokenStr string) (*AdminClaims, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &AdminClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := tok.Claims.(*AdminClaims)
	if !ok || !tok.Valid {
		return nil, errors.New("invalid token claims")
	}
	return claims, nil
}
