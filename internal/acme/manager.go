package acme

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/go-acme/lego/v4/certcrypto"
	"github.com/go-acme/lego/v4/certificate"
	"github.com/go-acme/lego/v4/lego"
	"github.com/go-acme/lego/v4/providers/dns/alidns"
	"github.com/go-acme/lego/v4/providers/dns/cloudflare"
	"github.com/go-acme/lego/v4/providers/dns/dnspod"
	"github.com/go-acme/lego/v4/registration"

	mihobcrypto "github.com/mihob/mihob/internal/crypto"
)

type Manager struct {
	dataDir    string
	mu         sync.Mutex
	challenges sync.Map // token -> keyAuth for HTTP-01
}

func NewManager(dataDir string) *Manager {
	return &Manager{dataDir: dataDir}
}

// ServeHTTPChallenge serves `/.well-known/acme-challenge/{token}` for HTTP-01 verification.
func (m *Manager) ServeHTTPChallenge(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.URL.Path, "/.well-known/acme-challenge/")
	if token == "" || strings.Contains(token, "/") {
		http.NotFound(w, r)
		return
	}
	v, ok := m.challenges.Load(token)
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte(v.(string)))
}

type memHTTPProvider struct {
	m *Manager
}

func (p *memHTTPProvider) Present(domain, token, keyAuth string) error {
	p.m.challenges.Store(token, keyAuth)
	return nil
}

func (p *memHTTPProvider) CleanUp(domain, token, keyAuth string) error {
	p.m.challenges.Delete(token)
	return nil
}

type acmeUser struct {
	Email        string
	Registration *registration.Resource
	key          crypto.PrivateKey
}

func (u *acmeUser) GetEmail() string                        { return u.Email }
func (u *acmeUser) GetRegistration() *registration.Resource { return u.Registration }
func (u *acmeUser) GetPrivateKey() crypto.PrivateKey        { return u.key }

type IssueRequest struct {
	Domain      string
	SANs        []string
	Email       string
	Provider    string            // "http" | "cloudflare" | "alidns" | "dnspod"
	Credentials map[string]string // provider-specific credentials
}

type IssueResult struct {
	CertPEM string
	KeyPEM  string
	Meta    *mihobcrypto.CertMetadata
}

func (m *Manager) Issue(req IssueRequest) (*IssueResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if strings.TrimSpace(req.Domain) == "" {
		return nil, errors.New("domain is required")
	}
	if strings.TrimSpace(req.Email) == "" {
		return nil, errors.New("ACME email is required")
	}

	acctKey, err := m.loadOrCreateAccountKey()
	if err != nil {
		return nil, fmt.Errorf("load acme account key: %w", err)
	}

	user := &acmeUser{
		Email: req.Email,
		key:   acctKey,
	}
	cfg := lego.NewConfig(user)
	cfg.Certificate.KeyType = certcrypto.EC256

	client, err := lego.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("create lego client: %w", err)
	}

	switch strings.ToLower(strings.TrimSpace(req.Provider)) {
	case "", "http", "http-01":
		if err := client.Challenge.SetHTTP01Provider(&memHTTPProvider{m: m}); err != nil {
			return nil, fmt.Errorf("set http-01 provider: %w", err)
		}
	case "cloudflare":
		cfCfg := cloudflare.NewDefaultConfig()
		if tok := strings.TrimSpace(req.Credentials["api_token"]); tok != "" {
			cfCfg.AuthToken = tok
		} else {
			cfCfg.AuthEmail = strings.TrimSpace(req.Credentials["email"])
			cfCfg.AuthKey = strings.TrimSpace(req.Credentials["api_key"])
		}
		prov, err := cloudflare.NewDNSProviderConfig(cfCfg)
		if err != nil {
			return nil, fmt.Errorf("cloudflare dns provider: %w", err)
		}
		if err := client.Challenge.SetDNS01Provider(prov); err != nil {
			return nil, err
		}
	case "alidns":
		aliCfg := alidns.NewDefaultConfig()
		aliCfg.APIKey = strings.TrimSpace(req.Credentials["access_key"])
		aliCfg.SecretKey = strings.TrimSpace(req.Credentials["secret_key"])
		prov, err := alidns.NewDNSProviderConfig(aliCfg)
		if err != nil {
			return nil, fmt.Errorf("alidns provider: %w", err)
		}
		if err := client.Challenge.SetDNS01Provider(prov); err != nil {
			return nil, err
		}
	case "dnspod":
		dpCfg := dnspod.NewDefaultConfig()
		dpCfg.LoginToken = strings.TrimSpace(req.Credentials["login_token"])
		prov, err := dnspod.NewDNSProviderConfig(dpCfg)
		if err != nil {
			return nil, fmt.Errorf("dnspod provider: %w", err)
		}
		if err := client.Challenge.SetDNS01Provider(prov); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported ACME provider: %s", req.Provider)
	}

	reg, err := client.Registration.Register(registration.RegisterOptions{TermsOfServiceAgreed: true})
	if err != nil {
		return nil, fmt.Errorf("acme register: %w", err)
	}
	user.Registration = reg

	domains := []string{strings.TrimSpace(req.Domain)}
	seen := map[string]struct{}{domains[0]: {}}
	for _, s := range req.SANs {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; !ok {
			seen[s] = struct{}{}
			domains = append(domains, s)
		}
	}

	res, err := client.Certificate.Obtain(certificate.ObtainRequest{
		Domains: domains,
		Bundle:  true,
	})
	if err != nil {
		return nil, fmt.Errorf("obtain certificate: %w", err)
	}

	certPEM := string(res.Certificate)
	keyPEM := string(res.PrivateKey)
	meta, err := mihobcrypto.ParseCertPEM(certPEM, keyPEM)
	if err != nil {
		return nil, err
	}
	return &IssueResult{
		CertPEM: certPEM,
		KeyPEM:  keyPEM,
		Meta:    meta,
	}, nil
}

func (m *Manager) loadOrCreateAccountKey() (crypto.PrivateKey, error) {
	dir := filepath.Join(m.dataDir, "acme")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	keyPath := filepath.Join(dir, "account.key")
	if b, err := os.ReadFile(keyPath); err == nil {
		block, _ := pem.Decode(b)
		if block != nil {
			if k, err := x509.ParseECPrivateKey(block.Bytes); err == nil {
				return k, nil
			}
		}
	}
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalECPrivateKey(k)
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})
	if err := os.WriteFile(keyPath, pemBytes, 0o600); err != nil {
		return nil, err
	}
	return k, nil
}
