package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	DefaultHost                 = "0.0.0.0"
	DefaultPort                 = "8080"
	DefaultTrafficRetentionDays = 365
)

// HubConfig holds bootstrap and runtime infrastructure settings loaded from config.yaml.
// Precedence: CLI flags > Environment variables > config.yaml > defaults.
type HubConfig struct {
	Server   ServerConfig   `yaml:"server"`
	Security SecurityConfig `yaml:"security"`
	Storage  StorageConfig  `yaml:"storage"`
}

type ServerConfig struct {
	Host string `yaml:"host"`
	Port string `yaml:"port"`
}

type SecurityConfig struct {
	TrustProxy          bool     `yaml:"trust_proxy"`
	CORSOrigins         []string `yaml:"cors_origins"`
	AllowPrivateWebhook bool     `yaml:"allow_private_webhook"`
}

type StorageConfig struct {
	TrafficRetentionDays int `yaml:"traffic_retention_days"`
}

func DefaultHubConfig() *HubConfig {
	return &HubConfig{
		Server: ServerConfig{
			Host: DefaultHost,
			Port: DefaultPort,
		},
		Security: SecurityConfig{
			TrustProxy:          false,
			CORSOrigins:         []string{},
			AllowPrivateWebhook: false,
		},
		Storage: StorageConfig{
			TrafficRetentionDays: DefaultTrafficRetentionDays,
		},
	}
}

const defaultHubConfigTemplate = `# mihob Hub configuration
# Precedence: CLI flags > Environment variables (MIHOB_*) > config.yaml > defaults
# Dynamic business settings (public URL, sub path, ACME email, themes, etc.) are managed in the Web UI.

server:
  host: "0.0.0.0"
  port: "8080"

security:
  # Trust X-Forwarded-For / X-Real-IP from non-private reverse proxies (loopback/private proxies are always trusted)
  trust_proxy: false
  # Extra allowed CORS origins (same-origin and hub_public_url are allowed automatically)
  cors_origins: []
  # Allow notification webhooks targeting loopback/private/LAN addresses (blocked by default for SSRF protection)
  allow_private_webhook: false

storage:
  # Hourly traffic history retention in days (0 disables automatic pruning)
  traffic_retention_days: 365
`

// LoadOrInitHub reads HubConfig from path, or creates a commented default file if it does not exist.
func LoadOrInitHub(path string) (*HubConfig, bool, error) {
	cfg := DefaultHubConfig()
	if strings.TrimSpace(path) == "" {
		return cfg, false, nil
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			if mkErr := os.MkdirAll(filepath.Dir(path), 0o755); mkErr != nil {
				return nil, false, fmt.Errorf("create config directory: %w", mkErr)
			}
			if writeErr := os.WriteFile(path, []byte(defaultHubConfigTemplate), 0o600); writeErr != nil {
				return nil, false, fmt.Errorf("write default config: %w", writeErr)
			}
			return cfg, true, nil
		}
		return nil, false, fmt.Errorf("read config %q: %w", path, err)
	}

	if len(strings.TrimSpace(string(raw))) > 0 {
		if err := yaml.Unmarshal(raw, cfg); err != nil {
			return nil, false, fmt.Errorf("parse config %q: %w", path, err)
		}
	}
	cfg.Normalize()
	return cfg, false, nil
}

func (c *HubConfig) Normalize() {
	if c == nil {
		return
	}
	c.Server.Host = strings.TrimSpace(c.Server.Host)
	if c.Server.Host == "" {
		c.Server.Host = DefaultHost
	}
	c.Server.Port = strings.TrimSpace(c.Server.Port)
	if c.Server.Port == "" {
		c.Server.Port = DefaultPort
	}
	if c.Storage.TrafficRetentionDays < 0 {
		c.Storage.TrafficRetentionDays = 0
	}
	if len(c.Security.CORSOrigins) > 0 {
		cleaned := make([]string, 0, len(c.Security.CORSOrigins))
		for _, item := range c.Security.CORSOrigins {
			if t := strings.TrimRight(strings.TrimSpace(item), "/"); t != "" {
				cleaned = append(cleaned, t)
			}
		}
		c.Security.CORSOrigins = cleaned
	} else {
		c.Security.CORSOrigins = []string{}
	}
}

// ApplyEnv overlays standard MIHOB_* environment variables onto cfg when explicitly set.
func (c *HubConfig) ApplyEnv() {
	if c == nil {
		return
	}
	if v := strings.TrimSpace(os.Getenv("MIHOB_HOST")); v != "" {
		c.Server.Host = v
	}
	if v := strings.TrimSpace(os.Getenv("MIHOB_PORT")); v != "" {
		c.Server.Port = v
	}
	if v := strings.TrimSpace(os.Getenv("MIHOB_TRUST_PROXY")); v != "" {
		c.Security.TrustProxy = parseBoolEnv(v)
	}
	if v := strings.TrimSpace(os.Getenv("MIHOB_ALLOW_PRIVATE_WEBHOOK")); v != "" {
		c.Security.AllowPrivateWebhook = parseBoolEnv(v)
	}
	if v := strings.TrimSpace(os.Getenv("MIHOB_CORS_ORIGINS")); v != "" {
		parts := strings.Split(v, ",")
		origins := make([]string, 0, len(parts))
		for _, p := range parts {
			if t := strings.TrimRight(strings.TrimSpace(p), "/"); t != "" {
				origins = append(origins, t)
			}
		}
		c.Security.CORSOrigins = origins
	}
	if v := strings.TrimSpace(os.Getenv("MIHOB_TRAFFIC_RETENTION_DAYS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			if n < 0 {
				n = 0
			}
			c.Storage.TrafficRetentionDays = n
		}
	}
	c.Normalize()
}

func parseBoolEnv(v string) bool {
	return strings.EqualFold(v, "true") || v == "1" || strings.EqualFold(v, "yes")
}
